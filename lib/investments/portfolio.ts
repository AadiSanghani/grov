'use server'

import { format, subMonths, subYears } from 'date-fns'
import { getInvestmentAccounts } from '@/lib/investments/accounts'
import { getBenchmarkSeriesCad } from '@/lib/investments/benchmark'
import { getFxRate, getFxRateSeries } from '@/lib/investments/fx'
import {
  getHistoricalSeriesForSecurity,
  getQuoteSnapshotsForSecurities,
} from '@/lib/investments/market-data'
import { deriveHoldingsAndRealized } from '@/lib/investments/ledger'
import { getInvestmentTransactions } from '@/lib/investments/transactions'
import type {
  BenchmarkSeriesPoint,
  InvestmentAllocationData,
  InvestmentDashboardData,
  InvestmentRealizedData,
  InvestmentSecurity,
  InvestmentTimeRange,
  InvestmentTransaction,
  PortfolioSeriesPoint,
} from '@/lib/investments/types'
import {
  CAD_CURRENCY,
  normalizeToBase100,
  round2,
  toAllocationSlices,
  toIsoDate,
} from '@/lib/investments/utils'

function todayDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function toRangeStartDate(range: InvestmentTimeRange, endDate: string): string {
  const end = new Date(`${endDate}T12:00:00.000Z`)

  switch (range) {
    case '1M':
      return format(subMonths(end, 1), 'yyyy-MM-dd')
    case '3M':
      return format(subMonths(end, 3), 'yyyy-MM-dd')
    case '1Y':
      return format(subYears(end, 1), 'yyyy-MM-dd')
    case 'ALL':
      return '2020-01-01'
    default:
      return format(subYears(end, 1), 'yyyy-MM-dd')
  }
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

function buildSecurityMap(transactions: InvestmentTransaction[]): Map<string, InvestmentSecurity> {
  const map = new Map<string, InvestmentSecurity>()
  for (const tx of transactions) {
    if (tx.security) {
      map.set(tx.security.id, tx.security)
    }
  }
  return map
}

function sortTransactionsAscending(transactions: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort((a, b) => {
    if (a.trade_date !== b.trade_date) {
      return a.trade_date < b.trade_date ? -1 : 1
    }

    const aCreated = Date.parse(a.created_at)
    const bCreated = Date.parse(b.created_at)
    if (aCreated !== bCreated) {
      return aCreated - bCreated
    }

    return Number(a.id) - Number(b.id)
  })
}

function buildFxResolver(input: {
  prefetchedByCurrency: Map<string, Map<string, number>>
}): (currency: string, date: string) => Promise<number> {
  const fxCache = new Map<string, number>()

  return async (currency: string, date: string): Promise<number> => {
    const normalizedCurrency = currency.trim().toUpperCase()
    if (normalizedCurrency === CAD_CURRENCY) return 1

    const key = `${normalizedCurrency}:CAD:${date}`
    const existing = fxCache.get(key)
    if (existing != null) return existing

    const prefetched = input.prefetchedByCurrency.get(normalizedCurrency)?.get(date)
    if (prefetched != null) {
      fxCache.set(key, prefetched)
      return prefetched
    }

    const fetched = await getFxRate(normalizedCurrency, 'CAD', date)
    fxCache.set(key, fetched)
    return fetched
  }
}

function buildHistoryLookupByDate(
  history: Array<{ date: string; close: number; currency: string }>,
  dates: string[],
): Map<string, { close: number; currency: string }> {
  const byDate = new Map<string, { close: number; currency: string }>()
  if (history.length === 0 || dates.length === 0) return byDate

  let historyIndex = 0
  let lastPoint: { close: number; currency: string } | null = null

  for (const date of dates) {
    while (historyIndex < history.length && history[historyIndex].date <= date) {
      lastPoint = {
        close: history[historyIndex].close,
        currency: history[historyIndex].currency,
      }
      historyIndex += 1
    }

    if (lastPoint) {
      byDate.set(date, lastPoint)
    }
  }

  return byDate
}

async function buildPortfolioSeriesCad(input: {
  transactions: InvestmentTransaction[]
  securityById: Map<string, InvestmentSecurity>
  startDate: string
  endDate: string
  fxToCadResolver: (currency: string, date: string) => Promise<number>
}): Promise<PortfolioSeriesPoint[]> {
  const ordered = sortTransactionsAscending(input.transactions)
  const dates = getDateInterval(input.startDate, input.endDate)

  if (ordered.length === 0 || dates.length === 0) return []

  const txByDate = new Map<string, InvestmentTransaction[]>()
  for (const tx of ordered) {
    const existing = txByDate.get(tx.trade_date) ?? []
    existing.push(tx)
    txByDate.set(tx.trade_date, existing)
  }

  const securityIds = Array.from(new Set(ordered.map((tx) => tx.security_id)))
  const historyBySecurity = new Map<string, Array<{ date: string; close: number; currency: string }>>()

  await Promise.all(
    securityIds.map(async (securityId) => {
      const security = input.securityById.get(securityId)
      if (!security) return

      const rows = await getHistoricalSeriesForSecurity(security, {
        startDate: addDays(input.startDate, -10),
        endDate: addDays(input.endDate, 1),
        allowFetch: false,
      })

      historyBySecurity.set(securityId, rows)
    }),
  )

  const historyLookupBySecurity = new Map<string, Map<string, { close: number; currency: string }>>()
  for (const securityId of securityIds) {
    const history = historyBySecurity.get(securityId) ?? []
    historyLookupBySecurity.set(securityId, buildHistoryLookupByDate(history, dates))
  }

  const positions = new Map<
    string,
    {
      quantity: number
      lastTradePrice: number
      quoteCurrency: string
    }
  >()

  const seriesValues: Array<{ date: string; value: number }> = []

  for (const date of dates) {
    const dayTransactions = txByDate.get(date) ?? []
    for (const tx of dayTransactions) {
      const key = `${tx.account_type_id}:${tx.security_id}`
      const current = positions.get(key) ?? {
        quantity: 0,
        lastTradePrice: tx.unit_price,
        quoteCurrency: tx.security?.quote_currency ?? tx.trade_currency,
      }

      if (tx.transaction_type === 'BUY' || tx.transaction_type === 'DRIP') {
        current.quantity += tx.quantity
      } else if (tx.transaction_type === 'SELL') {
        current.quantity = Math.max(0, current.quantity - tx.quantity)
      }

      current.lastTradePrice = tx.unit_price
      current.quoteCurrency = tx.security?.quote_currency ?? tx.trade_currency
      positions.set(key, current)
    }

    let portfolioValueCad = 0

    for (const [positionKey, position] of positions.entries()) {
      if (position.quantity <= 0) continue

      const [, securityId] = positionKey.split(':')
      const historyPoint = historyLookupBySecurity.get(securityId)?.get(date)

      const closePrice = historyPoint?.close ?? position.lastTradePrice
      const closeCurrency = historyPoint?.currency ?? position.quoteCurrency

      const fx =
        closeCurrency.toUpperCase() === CAD_CURRENCY
          ? 1
          : await input.fxToCadResolver(closeCurrency, date)

      portfolioValueCad += position.quantity * closePrice * fx
    }

    seriesValues.push({
      date,
      value: round2(portfolioValueCad),
    })
  }

  const normalized = normalizeToBase100(seriesValues)
  const normalizedByDate = new Map(normalized.map((row) => [row.date, row.normalized]))

  return seriesValues.map((row) => ({
    date: row.date,
    value_cad: row.value,
    normalized: normalizedByDate.get(row.date) ?? 0,
  }))
}

function computeDayChangePct(totalValueCad: number, dayChangeCad: number): number {
  const previousValue = totalValueCad - dayChangeCad
  if (previousValue <= 0) return 0
  return round2((dayChangeCad / previousValue) * 100)
}

function mergeBenchmarkWithPortfolioDates(
  portfolioSeries: PortfolioSeriesPoint[],
  benchmarkSeries: BenchmarkSeriesPoint[],
): BenchmarkSeriesPoint[] {
  const benchmarkByDate = new Map(benchmarkSeries.map((row) => [row.date, row]))

  const aligned: BenchmarkSeriesPoint[] = []
  let lastKnown: BenchmarkSeriesPoint | null = null

  for (const point of portfolioSeries) {
    const exact = benchmarkByDate.get(point.date)
    if (exact) {
      aligned.push(exact)
      lastKnown = exact
      continue
    }

    if (lastKnown) {
      aligned.push({
        date: point.date,
        value_cad: lastKnown.value_cad,
        normalized: lastKnown.normalized,
      })
    }
  }

  return aligned
}

function computeShareCountSlices(holdings: InvestmentDashboardData['holdings']) {
  const quantityByTicker = new Map<string, number>()
  for (const holding of holdings) {
    quantityByTicker.set(
      holding.ticker,
      (quantityByTicker.get(holding.ticker) ?? 0) + holding.quantity,
    )
  }

  const totalQuantity = Array.from(quantityByTicker.values()).reduce((sum, value) => sum + value, 0)
  if (totalQuantity <= 0) return []

  return Array.from(quantityByTicker.entries())
    .map(([label, quantity]) => ({
      label,
      quantity: round2(quantity),
      pct: round2((quantity / totalQuantity) * 100),
    }))
    .sort((a, b) => b.quantity - a.quantity)
}

export async function getInvestmentDashboardData(input?: {
  range?: InvestmentTimeRange
}): Promise<InvestmentDashboardData> {
  const range = input?.range ?? '1Y'
  const endDate = todayDate()
  const startDate = toRangeStartDate(range, endDate)

  const [accounts, transactions] = await Promise.all([
    getInvestmentAccounts(),
    getInvestmentTransactions(),
  ])

  if (transactions.length === 0) {
    return {
      primary_currency: 'CAD',
      as_of: null,
      summary: {
        total_value_cad: 0,
        total_cost_basis_cad: 0,
        total_unrealized_pnl_cad: 0,
        total_unrealized_pnl_pct: 0,
        total_realized_pnl_cad: 0,
        day_change_cad: 0,
        day_change_pct: 0,
      },
      holdings: [],
      realized_preview: [],
      allocation_by_account: [],
      allocation_by_currency: [],
      allocation_by_security: [],
      portfolio_series: [],
      benchmark_series: [],
      transactions: [],
      accounts,
      has_data: false,
    }
  }

  const securityById = buildSecurityMap(transactions)
  const securities = Array.from(securityById.values())

  const fxCurrencies = new Set<string>()
  for (const security of securities) {
    const currency = security.quote_currency.trim().toUpperCase()
    if (currency !== CAD_CURRENCY) {
      fxCurrencies.add(currency)
    }
  }
  for (const tx of transactions) {
    const currency = tx.trade_currency.trim().toUpperCase()
    if (currency !== CAD_CURRENCY) {
      fxCurrencies.add(currency)
    }
  }

  const prefetchedFxByCurrency = new Map<string, Map<string, number>>()
  await Promise.all(
    Array.from(fxCurrencies).map(async (currency) => {
      const series = await getFxRateSeries(currency, 'CAD', startDate, endDate)
      prefetchedFxByCurrency.set(currency, series)
    }),
  )

  const fxToCadResolver = buildFxResolver({
    prefetchedByCurrency: prefetchedFxByCurrency,
  })

  const quoteBySecurityId = await getQuoteSnapshotsForSecurities(securities, {
    allowFetch: false,
    forceRefresh: false,
  })

  const derived = await deriveHoldingsAndRealized({
    transactions,
    securityById,
    quoteBySecurityId,
    fxToCadResolver,
    valuationDate: endDate,
  })

  const totalValueCad = round2(derived.holdings.reduce((sum, row) => sum + row.market_value_cad, 0))
  const totalCostBasisCad = round2(derived.holdings.reduce((sum, row) => sum + row.cost_basis_cad, 0))
  const totalUnrealizedCad = round2(derived.holdings.reduce((sum, row) => sum + row.unrealized_pnl_cad, 0))
  const dayChangeCad = round2(derived.holdings.reduce((sum, row) => sum + row.day_change_cad, 0))
  const totalUnrealizedPct =
    totalCostBasisCad > 0
      ? round2((totalUnrealizedCad / totalCostBasisCad) * 100)
      : 0

  const allocationByAccount = new Map<string, number>()
  const allocationByCurrency = new Map<string, number>()
  const allocationBySecurity = new Map<string, number>()

  let asOf: string | null = null
  for (const holding of derived.holdings) {
    allocationByAccount.set(
      holding.account_name,
      (allocationByAccount.get(holding.account_name) ?? 0) + holding.market_value_cad,
    )

    allocationByCurrency.set(
      holding.current_price_currency,
      (allocationByCurrency.get(holding.current_price_currency) ?? 0) + holding.market_value_cad,
    )

    allocationBySecurity.set(
      holding.ticker,
      (allocationBySecurity.get(holding.ticker) ?? 0) + holding.market_value_cad,
    )

    if (holding.quote_as_of && (!asOf || holding.quote_as_of > asOf)) {
      asOf = holding.quote_as_of
    }
  }

  const portfolioSeries = await buildPortfolioSeriesCad({
    transactions,
    securityById,
    startDate,
    endDate,
    fxToCadResolver,
  })

  const benchmarkSeriesRaw = await getBenchmarkSeriesCad({
    startDate,
    endDate,
    fxToCadResolver,
  })

  const benchmarkSeries = mergeBenchmarkWithPortfolioDates(portfolioSeries, benchmarkSeriesRaw)

  return {
    primary_currency: 'CAD',
    as_of: asOf,
    summary: {
      total_value_cad: totalValueCad,
      total_cost_basis_cad: totalCostBasisCad,
      total_unrealized_pnl_cad: totalUnrealizedCad,
      total_unrealized_pnl_pct: totalUnrealizedPct,
      total_realized_pnl_cad: derived.totalRealizedCad,
      day_change_cad: dayChangeCad,
      day_change_pct: computeDayChangePct(totalValueCad, dayChangeCad),
    },
    holdings: derived.holdings,
    realized_preview: derived.realizedRows.slice(0, 8),
    allocation_by_account: toAllocationSlices(allocationByAccount),
    allocation_by_currency: toAllocationSlices(allocationByCurrency),
    allocation_by_security: toAllocationSlices(allocationBySecurity),
    portfolio_series: portfolioSeries,
    benchmark_series: benchmarkSeries,
    transactions: transactions.slice(0, 30),
    accounts,
    has_data: true,
  }
}

export async function getInvestmentAllocationData(input?: {
  range?: InvestmentTimeRange
}): Promise<InvestmentAllocationData> {
  const range = input?.range ?? '1Y'
  const endDate = todayDate()
  const startDate = toRangeStartDate(range, endDate)

  const [accounts, transactions] = await Promise.all([
    getInvestmentAccounts(),
    getInvestmentTransactions(),
  ])

  if (transactions.length === 0) {
    return {
      primary_currency: 'CAD',
      as_of: null,
      summary: {
        total_value_cad: 0,
        total_cost_basis_cad: 0,
        total_unrealized_pnl_cad: 0,
        total_unrealized_pnl_pct: 0,
        total_realized_pnl_cad: 0,
        day_change_cad: 0,
        day_change_pct: 0,
      },
      holdings: [],
      allocation_by_account: [],
      allocation_by_currency: [],
      allocation_by_security: [],
      share_count_by_security: [],
      accounts,
      has_data: false,
    }
  }

  const securityById = buildSecurityMap(transactions)
  const securities = Array.from(securityById.values())

  const fxCurrencies = new Set<string>()
  for (const security of securities) {
    const currency = security.quote_currency.trim().toUpperCase()
    if (currency !== CAD_CURRENCY) {
      fxCurrencies.add(currency)
    }
  }
  for (const tx of transactions) {
    const currency = tx.trade_currency.trim().toUpperCase()
    if (currency !== CAD_CURRENCY) {
      fxCurrencies.add(currency)
    }
  }

  const prefetchedFxByCurrency = new Map<string, Map<string, number>>()
  await Promise.all(
    Array.from(fxCurrencies).map(async (currency) => {
      const series = await getFxRateSeries(currency, 'CAD', startDate, endDate)
      prefetchedFxByCurrency.set(currency, series)
    }),
  )

  const fxToCadResolver = buildFxResolver({
    prefetchedByCurrency: prefetchedFxByCurrency,
  })

  const quoteBySecurityId = await getQuoteSnapshotsForSecurities(securities, {
    allowFetch: false,
    forceRefresh: false,
  })

  const derived = await deriveHoldingsAndRealized({
    transactions,
    securityById,
    quoteBySecurityId,
    fxToCadResolver,
    valuationDate: endDate,
  })

  const totalValueCad = round2(derived.holdings.reduce((sum, row) => sum + row.market_value_cad, 0))
  const totalCostBasisCad = round2(derived.holdings.reduce((sum, row) => sum + row.cost_basis_cad, 0))
  const totalUnrealizedCad = round2(derived.holdings.reduce((sum, row) => sum + row.unrealized_pnl_cad, 0))
  const dayChangeCad = round2(derived.holdings.reduce((sum, row) => sum + row.day_change_cad, 0))
  const totalUnrealizedPct =
    totalCostBasisCad > 0
      ? round2((totalUnrealizedCad / totalCostBasisCad) * 100)
      : 0

  const allocationByAccount = new Map<string, number>()
  const allocationByCurrency = new Map<string, number>()
  const allocationBySecurity = new Map<string, number>()

  let asOf: string | null = null
  for (const holding of derived.holdings) {
    allocationByAccount.set(
      holding.account_name,
      (allocationByAccount.get(holding.account_name) ?? 0) + holding.market_value_cad,
    )

    allocationByCurrency.set(
      holding.current_price_currency,
      (allocationByCurrency.get(holding.current_price_currency) ?? 0) + holding.market_value_cad,
    )

    allocationBySecurity.set(
      holding.ticker,
      (allocationBySecurity.get(holding.ticker) ?? 0) + holding.market_value_cad,
    )

    if (holding.quote_as_of && (!asOf || holding.quote_as_of > asOf)) {
      asOf = holding.quote_as_of
    }
  }

  return {
    primary_currency: 'CAD',
    as_of: asOf,
    summary: {
      total_value_cad: totalValueCad,
      total_cost_basis_cad: totalCostBasisCad,
      total_unrealized_pnl_cad: totalUnrealizedCad,
      total_unrealized_pnl_pct: totalUnrealizedPct,
      total_realized_pnl_cad: derived.totalRealizedCad,
      day_change_cad: dayChangeCad,
      day_change_pct: computeDayChangePct(totalValueCad, dayChangeCad),
    },
    holdings: derived.holdings,
    allocation_by_account: toAllocationSlices(allocationByAccount),
    allocation_by_currency: toAllocationSlices(allocationByCurrency),
    allocation_by_security: toAllocationSlices(allocationBySecurity),
    share_count_by_security: computeShareCountSlices(derived.holdings),
    accounts,
    has_data: true,
  }
}

export async function getInvestmentRealizedData(input?: {
  accountTypeId?: string
  ticker?: string
  startDate?: string
  endDate?: string
}): Promise<InvestmentRealizedData> {
  const transactions = await getInvestmentTransactions({
    accountTypeId: input?.accountTypeId,
    startDate: input?.startDate ? toIsoDate(input.startDate) : undefined,
    endDate: input?.endDate ? toIsoDate(input.endDate) : undefined,
  })

  const securityById = buildSecurityMap(transactions)

  const fxCurrencies = new Set<string>()
  for (const tx of transactions) {
    const currency = tx.trade_currency.trim().toUpperCase()
    if (currency !== CAD_CURRENCY) {
      fxCurrencies.add(currency)
    }
  }

  const dateBounds = transactions.reduce(
    (acc, tx) => ({
      start: tx.trade_date < acc.start ? tx.trade_date : acc.start,
      end: tx.trade_date > acc.end ? tx.trade_date : acc.end,
    }),
    { start: todayDate(), end: todayDate() },
  )

  const prefetchedFxByCurrency = new Map<string, Map<string, number>>()
  await Promise.all(
    Array.from(fxCurrencies).map(async (currency) => {
      const series = await getFxRateSeries(currency, 'CAD', dateBounds.start, dateBounds.end)
      prefetchedFxByCurrency.set(currency, series)
    }),
  )

  const fxToCadResolver = buildFxResolver({
    prefetchedByCurrency: prefetchedFxByCurrency,
  })

  const { realizedRows } = await deriveHoldingsAndRealized({
    transactions,
    securityById,
    quoteBySecurityId: new Map(),
    fxToCadResolver,
    valuationDate: todayDate(),
  })

  const filtered = realizedRows.filter((row) => {
    if (input?.ticker && row.ticker.toUpperCase() !== input.ticker.toUpperCase()) {
      return false
    }

    if (input?.startDate && row.trade_date < toIsoDate(input.startDate)) {
      return false
    }

    if (input?.endDate && row.trade_date > toIsoDate(input.endDate)) {
      return false
    }

    return true
  })

  return {
    rows: filtered,
    totals: {
      proceeds_cad: round2(filtered.reduce((sum, row) => sum + row.proceeds_cad, 0)),
      cost_basis_cad: round2(filtered.reduce((sum, row) => sum + row.cost_basis_cad, 0)),
      realized_pnl_cad: round2(filtered.reduce((sum, row) => sum + row.realized_pnl_cad, 0)),
    },
  }
}
