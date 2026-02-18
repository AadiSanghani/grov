'use server'

import {
  addDays,
  compareAsc,
  eachDayOfInterval,
  format,
  isWithinInterval,
  parseISO,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'
import { getInvestmentAccounts } from './accounts'
import { getInvestmentTransactions } from './transactions'
import { getFxRate } from './fx'
import { getHistorical, getQuote } from './yahoo'
import type {
  AccountStatusRow,
  AllocationSlice,
  HoldingsSnapshotRow,
  InvestmentAccount,
  InvestmentRangeKey,
  InvestmentTransaction,
  PortfolioPerformancePoint,
  RealizedGainRow,
} from './types'

interface PositionState {
  account_id: string
  account_name: string
  base_currency: string
  security_id: string
  ticker: string
  security_name: string | null
  asset_type: string
  quote_currency: string
  quantity: number
  cost_basis_base: number
  avg_cost_base: number
  last_trade_price_quote: number
}

interface PortfolioFilters {
  accountId?: string
  ticker?: string
  startDate?: string
  endDate?: string
}

interface PortfolioComputation {
  holdings: HoldingsSnapshotRow[]
  realizedRows: RealizedGainRow[]
  allocationByAssetType: AllocationSlice[]
  allocationByCurrency: AllocationSlice[]
  allocationByAccount: AllocationSlice[]
  accountStatus: AccountStatusRow[]
}

interface PerformanceFilters {
  accountId?: string
  range?: InvestmentRangeKey
}

interface PortfolioPerformanceResult {
  range: InvestmentRangeKey
  points: PortfolioPerformancePoint[]
  start_value_base: number
  end_value_base: number
  total_return_pct: number
  data_state: 'live' | 'fallback' | 'empty'
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeCurrency(value: string | null | undefined) {
  return (value ?? 'CAD').trim().toUpperCase()
}

function toBaseAmount(
  amount: number,
  txCurrency: string,
  baseCurrency: string,
  fxRateToBase?: number | null,
) {
  const from = normalizeCurrency(txCurrency)
  const to = normalizeCurrency(baseCurrency)
  if (from === to) return amount
  if (fxRateToBase != null && Number.isFinite(fxRateToBase) && fxRateToBase > 0) {
    return amount * Number(fxRateToBase)
  }
  // Temporary no-FX fallback path to avoid blocking.
  return amount
}

function makePositionKey(accountId: string, securityId: string) {
  return `${accountId}::${securityId}`
}

function sortTransactionsAscending(transactions: InvestmentTransaction[]) {
  return [...transactions].sort((a, b) => {
    const dateCmp = compareAsc(parseISO(a.trade_date), parseISO(b.trade_date))
    if (dateCmp !== 0) return dateCmp
    const aTs = a.created_at ? Date.parse(a.created_at) : 0
    const bTs = b.created_at ? Date.parse(b.created_at) : 0
    return aTs - bTs
  })
}

function toPercentSlices(source: Map<string, number>): AllocationSlice[] {
  const total = Array.from(source.values()).reduce((acc, value) => acc + value, 0)
  const rows = Array.from(source.entries())
    .map(([label, value]) => ({
      label,
      value_base: round2(value),
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value_base - a.value_base)

  return rows.map((row) => ({
    ...row,
    pct: round2(row.pct),
  }))
}

function isInDateRange(dateStr: string, startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return true
  const date = parseISO(dateStr)
  const start = startDate ? parseISO(startDate) : parseISO('1900-01-01')
  const end = endDate ? parseISO(endDate) : parseISO('2999-12-31')
  return isWithinInterval(date, { start, end })
}

function getTodayLocalDateString() {
  const now = new Date()
  return format(now, 'yyyy-MM-dd')
}

function getRangeStartDate(endDate: string, range: InvestmentRangeKey) {
  const end = parseISO(endDate)
  switch (range) {
    case '1W':
      return format(subWeeks(end, 1), 'yyyy-MM-dd')
    case '1M':
      return format(subMonths(end, 1), 'yyyy-MM-dd')
    case '3M':
      return format(subMonths(end, 3), 'yyyy-MM-dd')
    case '6M':
      return format(subMonths(end, 6), 'yyyy-MM-dd')
    case 'YTD':
      return format(startOfYear(end), 'yyyy-MM-dd')
    case '1Y':
      return format(subYears(end, 1), 'yyyy-MM-dd')
    case '5Y':
      return format(subYears(end, 5), 'yyyy-MM-dd')
    default:
      return format(subMonths(end, 3), 'yyyy-MM-dd')
  }
}

async function getQuoteMap(tickers: string[]) {
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)))
  const entries = await Promise.all(
    unique.map(async (ticker) => {
      try {
        const quote = await getQuote(ticker)
        return [ticker, quote] as const
      } catch {
        return [ticker, null] as const
      }
    }),
  )
  return new Map(entries)
}

async function toBaseFromQuoteCurrency(amountQuote: number, quoteCurrency: string, baseCurrency: string) {
  const from = normalizeCurrency(quoteCurrency)
  const to = normalizeCurrency(baseCurrency)
  if (from === to) {
    return { amountBase: amountQuote, fallback: false }
  }

  try {
    const fx = await getFxRate(from, to)
    return { amountBase: amountQuote * fx, fallback: false }
  } catch {
    return { amountBase: amountQuote, fallback: true }
  }
}

function filterTransactions(transactions: InvestmentTransaction[], filters: PortfolioFilters) {
  return transactions.filter((tx) => {
    if (filters.accountId && tx.account_id !== filters.accountId) return false
    if (filters.ticker && tx.ticker?.toUpperCase() !== filters.ticker.toUpperCase()) return false
    return true
  })
}

export async function computePortfolioPerformanceSeries(
  filters: PerformanceFilters = {},
): Promise<PortfolioPerformanceResult> {
  const range = filters.range ?? '3M'
  const endDate = getTodayLocalDateString()
  const startDate = getRangeStartDate(endDate, range)

  const [accounts, transactionsRaw] = await Promise.all([
    getInvestmentAccounts(),
    getInvestmentTransactions(),
  ])

  const txs = filterTransactions(transactionsRaw, { accountId: filters.accountId })
  if (txs.length === 0) {
    return {
      range,
      points: [],
      start_value_base: 0,
      end_value_base: 0,
      total_return_pct: 0,
      data_state: 'empty',
    }
  }

  const ordered = sortTransactionsAscending(txs)
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const portfolioBaseCurrency = normalizeCurrency(
    accountById.get(ordered[0].account_id)?.base_currency ?? ordered[0].account_base_currency ?? 'CAD',
  )

  const txByDate = new Map<string, InvestmentTransaction[]>()
  for (const tx of ordered) {
    if (!txByDate.has(tx.trade_date)) txByDate.set(tx.trade_date, [])
    txByDate.get(tx.trade_date)!.push(tx)
  }

  const dates = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map((d) => format(d, 'yyyy-MM-dd'))

  const tickers = Array.from(new Set(ordered.map((tx) => tx.ticker?.toUpperCase()).filter(Boolean) as string[]))

  const historyStartDate = format(addDays(parseISO(startDate), -7), 'yyyy-MM-dd')
  const historyEndDate = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd')
  const historyEntries = await Promise.all(
    tickers.map(async (ticker): Promise<[string, { date: string; close: number }[]]> => {
      try {
        const history = await getHistorical(ticker, {
          startDate: historyStartDate,
          endDate: historyEndDate,
        })
        return [
          ticker,
          history.points
            .map((point) => ({ date: point.date, close: point.close }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        ]
      } catch {
        return [ticker, []]
      }
    }),
  )

  const historyByTicker = new Map<string, { date: string; close: number }[]>(historyEntries)
  const hasHistoricalData = historyEntries.some(([, points]) => points.length > 0)

  const tickerCursor = new Map<string, { idx: number; lastClose: number | null }>()
  for (const ticker of tickers) {
    tickerCursor.set(ticker, { idx: 0, lastClose: null })
  }

  const fxByCurrencyPair = new Map<string, number>()
  let usedFallback = false

  async function getBaseFx(quoteCurrency: string) {
    const from = normalizeCurrency(quoteCurrency)
    if (from === portfolioBaseCurrency) return 1
    const key = `${from}:${portfolioBaseCurrency}`
    if (fxByCurrencyPair.has(key)) return fxByCurrencyPair.get(key)!
    try {
      const fx = await getFxRate(from, portfolioBaseCurrency, endDate)
      fxByCurrencyPair.set(key, fx)
      return fx
    } catch {
      usedFallback = true
      fxByCurrencyPair.set(key, 1)
      return 1
    }
  }

  const positions = new Map<
    string,
    {
      security_id: string
      ticker: string
      quote_currency: string
      quantity: number
      last_trade_price_quote: number
    }
  >()

  const points: PortfolioPerformancePoint[] = []

  for (const date of dates) {
    const dayTxs = txByDate.get(date) ?? []
    for (const tx of dayTxs) {
      const key = makePositionKey(tx.account_id, tx.security_id)
      const current = positions.get(key) ?? {
        security_id: tx.security_id,
        ticker: tx.ticker?.toUpperCase() ?? 'UNKNOWN',
        quote_currency: normalizeCurrency(tx.security_quote_currency ?? tx.currency),
        quantity: 0,
        last_trade_price_quote: tx.price,
      }

      if (tx.type === 'BUY') {
        current.quantity += tx.quantity
        current.last_trade_price_quote = tx.price
      } else if (tx.type === 'SELL') {
        current.quantity = Math.max(0, current.quantity - tx.quantity)
        current.last_trade_price_quote = tx.price
      } else if (tx.type === 'DIVIDEND' || tx.type === 'FEE') {
        current.last_trade_price_quote = current.last_trade_price_quote || tx.price
      }
      positions.set(key, current)
    }

    for (const ticker of tickers) {
      const series = historyByTicker.get(ticker) ?? []
      const cursor = tickerCursor.get(ticker)
      if (!cursor) continue
      while (cursor.idx < series.length && series[cursor.idx].date <= date) {
        cursor.lastClose = series[cursor.idx].close
        cursor.idx += 1
      }
    }

    let dayValueBase = 0
    for (const position of positions.values()) {
      if (position.quantity <= 0) continue
      const cursor = tickerCursor.get(position.ticker)
      const priceQuote = cursor?.lastClose ?? position.last_trade_price_quote
      if (!Number.isFinite(priceQuote) || priceQuote <= 0) continue
      if (cursor?.lastClose == null) usedFallback = true
      const fx = await getBaseFx(position.quote_currency)
      dayValueBase += position.quantity * priceQuote * fx
    }

    points.push({
      date,
      value_base: round2(dayValueBase),
      return_pct: 0,
    })
  }

  if (points.length === 0) {
    return {
      range,
      points: [],
      start_value_base: 0,
      end_value_base: 0,
      total_return_pct: 0,
      data_state: 'empty',
    }
  }

  const firstNonZero = points.find((point) => point.value_base > 0)
  const startValue = firstNonZero?.value_base ?? points[0].value_base
  for (const point of points) {
    point.return_pct = startValue > 0 ? round2(((point.value_base - startValue) / startValue) * 100) : 0
  }
  const endValue = points[points.length - 1].value_base
  const totalReturnPct = startValue > 0 ? round2(((endValue - startValue) / startValue) * 100) : 0

  return {
    range,
    points,
    start_value_base: round2(startValue),
    end_value_base: round2(endValue),
    total_return_pct: totalReturnPct,
    data_state: hasHistoricalData && !usedFallback ? 'live' : 'fallback',
  }
}

export async function computePortfolio(filters: PortfolioFilters = {}): Promise<PortfolioComputation> {
  const [accounts, transactionsRaw] = await Promise.all([
    getInvestmentAccounts(),
    getInvestmentTransactions(),
  ])

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const transactions = filterTransactions(transactionsRaw, filters)
  const ordered = sortTransactionsAscending(transactions)

  const positions = new Map<string, PositionState>()
  const realizedRows: RealizedGainRow[] = []

  for (const tx of ordered) {
    const account: InvestmentAccount | undefined = accountById.get(tx.account_id)
    const accountName = tx.account_name ?? account?.name ?? 'Investment Account'
    const baseCurrency = normalizeCurrency(tx.account_base_currency ?? account?.base_currency ?? 'CAD')
    const ticker = tx.ticker?.toUpperCase() ?? 'UNKNOWN'
    const key = makePositionKey(tx.account_id, tx.security_id)
    const current = positions.get(key) ?? {
      account_id: tx.account_id,
      account_name: accountName,
      base_currency: baseCurrency,
      security_id: tx.security_id,
      ticker,
      security_name: tx.security_name ?? null,
      asset_type: tx.security_asset_type ?? 'stock',
      quote_currency: normalizeCurrency(tx.security_quote_currency ?? tx.currency),
      quantity: 0,
      cost_basis_base: 0,
      avg_cost_base: 0,
      last_trade_price_quote: tx.price,
    }

    if (tx.type === 'BUY') {
      const costBase = toBaseAmount(
        tx.quantity * tx.price + tx.fees,
        tx.currency,
        current.base_currency,
        tx.fx_rate_to_base,
      )
      const nextQty = current.quantity + tx.quantity
      const nextCostBasis = current.cost_basis_base + costBase
      current.quantity = nextQty
      current.cost_basis_base = nextCostBasis
      current.avg_cost_base = nextQty > 0 ? nextCostBasis / nextQty : 0
      current.last_trade_price_quote = tx.price
    } else if (tx.type === 'SELL') {
      const proceedsBase = toBaseAmount(
        tx.quantity * tx.price - tx.fees,
        tx.currency,
        current.base_currency,
        tx.fx_rate_to_base,
      )
      const basisQty = Math.min(tx.quantity, Math.max(current.quantity, 0))
      const costBasisBase = basisQty * current.avg_cost_base
      const realized = proceedsBase - costBasisBase

      realizedRows.push({
        trade_date: tx.trade_date,
        account_id: current.account_id,
        account_name: current.account_name,
        ticker: current.ticker,
        quantity_sold: tx.quantity,
        proceeds_base: round2(proceedsBase),
        cost_basis_base: round2(costBasisBase),
        realized_pl_base: round2(realized),
      })

      const nextQty = Math.max(0, current.quantity - tx.quantity)
      const nextCostBasis = Math.max(0, current.cost_basis_base - costBasisBase)
      current.quantity = nextQty
      current.cost_basis_base = nextCostBasis
      current.avg_cost_base = nextQty > 0 ? nextCostBasis / nextQty : 0
      current.last_trade_price_quote = tx.price
    } else if (tx.type === 'DIVIDEND') {
      const realized = toBaseAmount(
        tx.price - tx.fees,
        tx.currency,
        current.base_currency,
        tx.fx_rate_to_base,
      )
      realizedRows.push({
        trade_date: tx.trade_date,
        account_id: current.account_id,
        account_name: current.account_name,
        ticker: current.ticker,
        quantity_sold: 0,
        proceeds_base: round2(realized),
        cost_basis_base: 0,
        realized_pl_base: round2(realized),
      })
    } else if (tx.type === 'FEE') {
      const realized = -toBaseAmount(
        tx.price + tx.fees,
        tx.currency,
        current.base_currency,
        tx.fx_rate_to_base,
      )
      realizedRows.push({
        trade_date: tx.trade_date,
        account_id: current.account_id,
        account_name: current.account_name,
        ticker: current.ticker,
        quantity_sold: 0,
        proceeds_base: round2(realized),
        cost_basis_base: 0,
        realized_pl_base: round2(realized),
      })
    }

    positions.set(key, current)
  }

  const activePositions = Array.from(positions.values()).filter((position) => position.quantity > 0)
  const quoteMap = await getQuoteMap(activePositions.map((position) => position.ticker))

  const holdings: HoldingsSnapshotRow[] = []
  for (const position of activePositions) {
    const quote = quoteMap.get(position.ticker)
    const usedFallbackPrice = !quote
    const currentPriceQuote = quote?.price ?? position.last_trade_price_quote ?? 0
    const marketValueQuote = position.quantity * currentPriceQuote
    const { amountBase: marketValueBase, fallback: fxFallback } = await toBaseFromQuoteCurrency(
      marketValueQuote,
      position.quote_currency,
      position.base_currency,
    )

    const unrealized = marketValueBase - position.cost_basis_base
    const returnPct = position.cost_basis_base > 0 ? (unrealized / position.cost_basis_base) * 100 : 0

    holdings.push({
      account_id: position.account_id,
      account_name: position.account_name,
      base_currency: position.base_currency,
      security_id: position.security_id,
      ticker: position.ticker,
      security_name: quote?.name ?? position.security_name,
      asset_type: position.asset_type,
      quote_currency: position.quote_currency,
      quantity: round2(position.quantity),
      avg_cost_base: round2(position.avg_cost_base),
      cost_basis_base: round2(position.cost_basis_base),
      current_price_quote: round2(currentPriceQuote),
      market_value_base: round2(marketValueBase),
      unrealized_pl_base: round2(unrealized),
      return_pct: round2(returnPct),
      price_source: usedFallbackPrice || fxFallback ? 'fallback' : 'live',
    })
  }

  const allocationByAssetTypeMap = new Map<string, number>()
  const allocationByCurrencyMap = new Map<string, number>()
  const allocationByAccountMap = new Map<string, number>()

  for (const holding of holdings) {
    allocationByAssetTypeMap.set(
      holding.asset_type,
      (allocationByAssetTypeMap.get(holding.asset_type) ?? 0) + holding.market_value_base,
    )
    allocationByCurrencyMap.set(
      holding.quote_currency,
      (allocationByCurrencyMap.get(holding.quote_currency) ?? 0) + holding.market_value_base,
    )
    allocationByAccountMap.set(
      holding.account_name,
      (allocationByAccountMap.get(holding.account_name) ?? 0) + holding.market_value_base,
    )
  }

  const allocationByAssetType = toPercentSlices(allocationByAssetTypeMap)
  const allocationByCurrency = toPercentSlices(allocationByCurrencyMap)
  const allocationByAccount = toPercentSlices(allocationByAccountMap)

  const realizedAllTimeByAccount = new Map<string, number>()
  const realizedInRangeByAccount = new Map<string, number>()

  for (const row of realizedRows) {
    realizedAllTimeByAccount.set(
      row.account_id,
      (realizedAllTimeByAccount.get(row.account_id) ?? 0) + row.realized_pl_base,
    )
    if (isInDateRange(row.trade_date, filters.startDate, filters.endDate)) {
      realizedInRangeByAccount.set(
        row.account_id,
        (realizedInRangeByAccount.get(row.account_id) ?? 0) + row.realized_pl_base,
      )
    }
  }

  const holdingsByAccount = new Map<string, HoldingsSnapshotRow[]>()
  for (const holding of holdings) {
    if (!holdingsByAccount.has(holding.account_id)) holdingsByAccount.set(holding.account_id, [])
    holdingsByAccount.get(holding.account_id)!.push(holding)
  }

  const accountStatus: AccountStatusRow[] = Array.from(holdingsByAccount.entries()).map(
    ([accountId, accountHoldings]) => {
      const market = accountHoldings.reduce((acc, row) => acc + row.market_value_base, 0)
      const cost = accountHoldings.reduce((acc, row) => acc + row.cost_basis_base, 0)
      const unrealized = market - cost
      const realizedAll = realizedAllTimeByAccount.get(accountId) ?? 0
      const realizedRange = realizedInRangeByAccount.get(accountId) ?? 0
      const totalReturnPct = cost > 0 ? ((unrealized + realizedAll) / cost) * 100 : 0
      return {
        account_id: accountId,
        account_name: accountHoldings[0].account_name,
        base_currency: accountHoldings[0].base_currency,
        market_value_base: round2(market),
        cost_basis_base: round2(cost),
        unrealized_pl_base: round2(unrealized),
        realized_pl_all_time_base: round2(realizedAll),
        realized_pl_in_range_base: round2(realizedRange),
        total_return_pct: round2(totalReturnPct),
      }
    },
  )

  const sortedRealizedRows = [...realizedRows].sort((a, b) => {
    const dateCmp = compareAsc(parseISO(b.trade_date), parseISO(a.trade_date))
    if (dateCmp !== 0) return dateCmp
    return a.ticker.localeCompare(b.ticker)
  })

  return {
    holdings: holdings.sort((a, b) => b.market_value_base - a.market_value_base),
    realizedRows: sortedRealizedRows,
    allocationByAssetType,
    allocationByCurrency,
    allocationByAccount,
    accountStatus: accountStatus.sort((a, b) => b.market_value_base - a.market_value_base),
  }
}
