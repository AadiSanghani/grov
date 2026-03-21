'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCurrency, round2, toIsoDate } from '@/lib/investments/utils'

interface YahooQuoteResult {
  regularMarketPrice?: number | null
  regularMarketPreviousClose?: number | null
}

interface YahooChartPoint {
  date?: Date
  close?: number | null
  adjclose?: number | null
}

interface YahooChartResult {
  quotes: YahooChartPoint[]
}

interface YahooFinanceClient {
  quote: (symbol: string, options?: Record<string, unknown>) => Promise<YahooQuoteResult>
  chart: (
    symbol: string,
    options: { period1: string; period2: string; interval?: '1d' | '1wk' | '1mo' },
  ) => Promise<YahooChartResult>
}

interface FxRateRow {
  base_currency: string
  quote_currency: string
  rate_date: string
  rate: string | number
}

type SupabaseClientLike = SupabaseClient

let yahooClientPromise: Promise<YahooFinanceClient> | null = null

function localDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function getDateInterval(startDate: string, endDate: string): string[] {
  const values: string[] = []
  let cursor = startDate
  while (cursor <= endDate) {
    values.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return values
}

function parseNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

async function loadYahooClient(): Promise<YahooFinanceClient> {
  if (!yahooClientPromise) {
    yahooClientPromise = (async () => {
      const importDynamic = new Function('m', 'return import(m)') as (moduleName: string) => Promise<unknown>
      const mod = await importDynamic('yahoo-finance2')
      const YahooFinanceClass = (mod as { default?: unknown }).default ?? mod

      if (typeof YahooFinanceClass !== 'function') {
        throw new Error('Invalid yahoo-finance2 export')
      }

      const client = new (YahooFinanceClass as new (opts?: { suppressNotices?: string[] }) => YahooFinanceClient)({
        suppressNotices: ['yahooSurvey'],
      })

      return client
    })()
  }

  return yahooClientPromise
}

function pickHistoricalCloseOnOrBeforeDate(
  points: Array<{ date: string; close: number }>,
  targetDate: string,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].date <= targetDate) {
      return points[index].close
    }
  }
  return null
}

async function fetchRateFromYahoo(baseCurrency: string, quoteCurrency: string, date: string): Promise<number> {
  const client = await loadYahooClient()

  const directTicker = `${baseCurrency}${quoteCurrency}=X`
  const inverseTicker = `${quoteCurrency}${baseCurrency}=X`

  const lookupHistorical = async (symbol: string): Promise<number | null> => {
    const result = await client.chart(symbol, {
      period1: addDays(date, -14),
      period2: addDays(date, 1),
      interval: '1d',
    })

    const points = (result.quotes ?? [])
      .map((row) => {
        const closeRaw = row.close ?? row.adjclose
        const close = closeRaw == null ? Number.NaN : Number(closeRaw)
        const pointDate = row.date ? toIsoDate(row.date) : ''
        return {
          date: pointDate,
          close,
        }
      })
      .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    return pickHistoricalCloseOnOrBeforeDate(points, date)
  }

  try {
    const directHistorical = await lookupHistorical(directTicker)
    if (directHistorical != null && directHistorical > 0) {
      return directHistorical
    }
  } catch {
    // Continue to inverse/live fallback below.
  }

  try {
    const inverseHistorical = await lookupHistorical(inverseTicker)
    if (inverseHistorical != null && inverseHistorical > 0) {
      return 1 / inverseHistorical
    }
  } catch {
    // Continue to live fallback below.
  }

  try {
    const directQuote = await client.quote(directTicker)
    const direct = Number(directQuote.regularMarketPrice ?? directQuote.regularMarketPreviousClose)
    if (Number.isFinite(direct) && direct > 0) {
      return direct
    }
  } catch {
    // Continue to inverse quote fallback.
  }

  const inverseQuote = await client.quote(inverseTicker)
  const inverse = Number(inverseQuote.regularMarketPrice ?? inverseQuote.regularMarketPreviousClose)
  if (Number.isFinite(inverse) && inverse > 0) {
    return 1 / inverse
  }

  throw new Error(`Unable to fetch FX rate for ${baseCurrency}/${quoteCurrency}`)
}

export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  dateInput?: string | Date,
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<number> {
  const baseCurrency = normalizeCurrency(fromCurrency)
  const quoteCurrency = normalizeCurrency(toCurrency)

  if (!baseCurrency || !quoteCurrency) {
    throw new Error('Both currencies are required')
  }

  if (baseCurrency === quoteCurrency) {
    return 1
  }

  const requestedDate = toIsoDate(dateInput ?? new Date())
  const today = localDateString(new Date())
  const rateDate = requestedDate > today ? today : requestedDate

  const supabase = options?.supabaseClient ?? createServerSupabaseClient()

  const { data: exactRate, error: exactRateError } = await supabase
    .from('investment_fx_rates_cache')
    .select('base_currency, quote_currency, rate_date, rate')
    .eq('base_currency', baseCurrency)
    .eq('quote_currency', quoteCurrency)
    .eq('rate_date', rateDate)
    .maybeSingle()

  if (exactRateError) throw exactRateError
  if (exactRate) {
    return parseNumber((exactRate as FxRateRow).rate)
  }

  const { data: latestPriorRate, error: latestPriorRateError } = await supabase
    .from('investment_fx_rates_cache')
    .select('base_currency, quote_currency, rate_date, rate')
    .eq('base_currency', baseCurrency)
    .eq('quote_currency', quoteCurrency)
    .lte('rate_date', rateDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestPriorRateError) throw latestPriorRateError

  if (latestPriorRate) {
    const row = latestPriorRate as FxRateRow
    const staleMs = Date.parse(`${rateDate}T00:00:00Z`) - Date.parse(`${row.rate_date}T00:00:00Z`)
    if (staleMs <= 7 * 24 * 60 * 60 * 1000) {
      return parseNumber(row.rate)
    }
  }

  const fetchedRate = await fetchRateFromYahoo(baseCurrency, quoteCurrency, rateDate)

  const { error: upsertError } = await supabase
    .from('investment_fx_rates_cache')
    .upsert(
      {
        base_currency: baseCurrency,
        quote_currency: quoteCurrency,
        rate_date: rateDate,
        rate: fetchedRate,
        source: 'yahoo',
        payload: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'base_currency,quote_currency,rate_date' },
    )

  if (upsertError) throw upsertError

  return fetchedRate
}

export async function convertToCad(
  amount: number,
  currency: string,
  dateInput?: string | Date,
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<number> {
  const normalized = normalizeCurrency(currency)
  if (normalized === 'CAD') return amount

  const rate = await getFxRate(normalized, 'CAD', dateInput, options)
  return round2(amount * rate)
}

export async function getFxRateSeries(
  fromCurrency: string,
  toCurrency: string,
  startDateInput: string | Date,
  endDateInput: string | Date,
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<Map<string, number>> {
  const baseCurrency = normalizeCurrency(fromCurrency)
  const quoteCurrency = normalizeCurrency(toCurrency)
  const startDate = toIsoDate(startDateInput)
  const requestedEndDate = toIsoDate(endDateInput)
  const today = localDateString(new Date())
  const endDate = requestedEndDate > today ? today : requestedEndDate
  const dates = getDateInterval(startDate, endDate)

  const series = new Map<string, number>()
  if (dates.length === 0) return series

  if (baseCurrency === quoteCurrency) {
    for (const date of dates) {
      series.set(date, 1)
    }
    return series
  }

  const supabase = options?.supabaseClient ?? createServerSupabaseClient()

  const [
    { data: priorRow, error: priorError },
    { data: rangeRows, error: rangeError },
  ] = await Promise.all([
    supabase
      .from('investment_fx_rates_cache')
      .select('base_currency, quote_currency, rate_date, rate')
      .eq('base_currency', baseCurrency)
      .eq('quote_currency', quoteCurrency)
      .lt('rate_date', startDate)
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('investment_fx_rates_cache')
      .select('base_currency, quote_currency, rate_date, rate')
      .eq('base_currency', baseCurrency)
      .eq('quote_currency', quoteCurrency)
      .gte('rate_date', startDate)
      .lte('rate_date', endDate)
      .order('rate_date', { ascending: true }),
  ])

  if (priorError) throw priorError
  if (rangeError) throw rangeError

  const exactRates = new Map<string, number>()
  for (const row of (rangeRows as FxRateRow[] | null) ?? []) {
    exactRates.set(row.rate_date, parseNumber(row.rate))
  }

  let lastRate = priorRow ? parseNumber((priorRow as FxRateRow).rate) : null

  if (lastRate == null && exactRates.size === 0) {
    const fallback = await getFxRate(baseCurrency, quoteCurrency, endDate, options)
    for (const date of dates) {
      series.set(date, fallback)
    }
    return series
  }

  if (lastRate == null) {
    lastRate = await getFxRate(baseCurrency, quoteCurrency, startDate, options)
  }

  for (const date of dates) {
    const exact = exactRates.get(date)
    if (exact != null) {
      lastRate = exact
    }

    if (lastRate != null) {
      series.set(date, lastRate)
    }
  }

  return series
}

export async function warmDefaultFxPairs(
  dateInput?: string | Date,
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<void> {
  await Promise.all([
    getFxRate('USD', 'CAD', dateInput, options),
    getFxRate('CAD', 'USD', dateInput, options),
  ])
}
