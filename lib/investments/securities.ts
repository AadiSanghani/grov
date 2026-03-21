'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import type { InvestmentSecurity } from '@/lib/investments/types'
import { normalizeCurrency, normalizeTicker } from '@/lib/investments/utils'

interface SecurityRow {
  id: number
  ticker: string
  yahoo_symbol: string
  name: string | null
  asset_type: string
  quote_currency: string
}

function mapSecurity(row: SecurityRow): InvestmentSecurity {
  return {
    id: String(row.id),
    ticker: row.ticker,
    yahoo_symbol: row.yahoo_symbol,
    name: row.name,
    asset_type: row.asset_type,
    quote_currency: row.quote_currency,
  }
}

function inferQuoteCurrency(ticker: string): string {
  if (ticker.endsWith('.TO') || ticker.endsWith('.V') || ticker.endsWith('.NE')) {
    return 'CAD'
  }
  return 'USD'
}

export async function getSecurityById(securityId: string): Promise<InvestmentSecurity | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('investment_securities')
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')
    .eq('id', Number(securityId))
    .maybeSingle()

  if (error) throw error
  return data ? mapSecurity(data as SecurityRow) : null
}

export async function getSecuritiesByIds(securityIds: string[]): Promise<InvestmentSecurity[]> {
  if (securityIds.length === 0) return []

  const ids = Array.from(new Set(securityIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))))
  if (ids.length === 0) return []

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('investment_securities')
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')
    .in('id', ids)

  if (error) throw error

  return (data as SecurityRow[] | null ?? []).map(mapSecurity)
}

export async function getOrCreateSecurityByTicker(input: {
  ticker: string
  quoteCurrency?: string
  name?: string | null
  yahooSymbol?: string
  assetType?: string
}): Promise<InvestmentSecurity> {
  const supabase = createServerSupabaseClient()
  const ticker = normalizeTicker(input.ticker)
  if (!ticker) {
    throw new Error('Ticker is required')
  }

  const yahooSymbol = normalizeTicker(input.yahooSymbol ?? ticker)

  const { data: existingByTicker, error: existingByTickerError } = await supabase
    .from('investment_securities')
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')
    .eq('ticker', ticker)
    .maybeSingle()

  if (existingByTickerError) throw existingByTickerError
  if (existingByTicker) return mapSecurity(existingByTicker as SecurityRow)

  const { data: existingByYahooSymbol, error: existingByYahooSymbolError } = await supabase
    .from('investment_securities')
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')
    .eq('yahoo_symbol', yahooSymbol)
    .maybeSingle()

  if (existingByYahooSymbolError) throw existingByYahooSymbolError
  if (existingByYahooSymbol) return mapSecurity(existingByYahooSymbol as SecurityRow)

  const quoteCurrency = normalizeCurrency(input.quoteCurrency ?? inferQuoteCurrency(ticker))

  const { data, error } = await supabase
    .from('investment_securities')
    .insert({
      ticker,
      yahoo_symbol: yahooSymbol,
      name: input.name?.trim() || null,
      asset_type: input.assetType?.trim() || 'stock',
      quote_currency: quoteCurrency,
    })
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')
    .single()

  if (error) throw error

  return mapSecurity(data as SecurityRow)
}

export async function ensureBenchmarkSecurity(): Promise<InvestmentSecurity> {
  return getOrCreateSecurityByTicker({
    ticker: '^GSPC',
    yahooSymbol: '^GSPC',
    quoteCurrency: 'USD',
    name: 'S&P 500 Index',
    assetType: 'index',
  })
}
