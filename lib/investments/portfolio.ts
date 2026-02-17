'use server'

import { compareAsc, isWithinInterval, parseISO } from 'date-fns'
import { getInvestmentAccounts } from './accounts'
import { getInvestmentTransactions } from './transactions'
import { getFxRate } from './fx'
import { getQuote } from './yahoo'
import type {
  AccountStatusRow,
  AllocationSlice,
  HoldingsSnapshotRow,
  InvestmentAccount,
  InvestmentTransaction,
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
      security_name: position.security_name,
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

