'use server'

import type {
  DerivedHolding,
  InvestmentQuoteSnapshot,
  InvestmentSecurity,
  InvestmentTransaction,
  RealizedPnLRow,
} from '@/lib/investments/types'
import { CAD_CURRENCY, normalizeCurrency, round2 } from '@/lib/investments/utils'

interface PositionState {
  account_type_id: string
  account_name: string
  security: InvestmentSecurity
  quantity: number
  cost_basis_cad: number
  last_trade_price: number
}

interface DeriveResult {
  holdings: DerivedHolding[]
  realizedRows: RealizedPnLRow[]
  totalRealizedCad: number
}

interface DeriveInput {
  transactions: InvestmentTransaction[]
  securityById: Map<string, InvestmentSecurity>
  quoteBySecurityId: Map<string, InvestmentQuoteSnapshot>
  fxToCadResolver: (currency: string, date: string) => Promise<number>
  valuationDate: string
}

function sortTransactionsAscending(transactions: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort((a, b) => {
    if (a.trade_date !== b.trade_date) {
      return a.trade_date < b.trade_date ? -1 : 1
    }

    const aCreatedAt = Date.parse(a.created_at)
    const bCreatedAt = Date.parse(b.created_at)
    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt
    }

    return Number(a.id) - Number(b.id)
  })
}

function makePositionKey(accountTypeId: string, securityId: string): string {
  return `${accountTypeId}:${securityId}`
}

function safeAccountName(transaction: InvestmentTransaction): string {
  return transaction.account_name || 'Investment Account'
}

export async function deriveHoldingsAndRealized(input: DeriveInput): Promise<DeriveResult> {
  const ordered = sortTransactionsAscending(input.transactions)
  const positions = new Map<string, PositionState>()
  const realizedRows: RealizedPnLRow[] = []

  for (const tx of ordered) {
    const security =
      tx.security ??
      input.securityById.get(tx.security_id) ?? {
        id: tx.security_id,
        ticker: 'UNKNOWN',
        yahoo_symbol: 'UNKNOWN',
        name: null,
        asset_type: 'stock',
        quote_currency: normalizeCurrency(tx.trade_currency),
      }

    const positionKey = makePositionKey(tx.account_type_id, tx.security_id)
    const existing = positions.get(positionKey)

    const position: PositionState = existing ?? {
      account_type_id: tx.account_type_id,
      account_name: safeAccountName(tx),
      security,
      quantity: 0,
      cost_basis_cad: 0,
      last_trade_price: tx.unit_price,
    }

    const tradeCurrency = normalizeCurrency(tx.trade_currency)
    const fxToCad =
      tradeCurrency === CAD_CURRENCY
        ? 1
        : tx.fx_rate_to_cad ?? (await input.fxToCadResolver(tradeCurrency, tx.trade_date))

    const grossTrade = tx.quantity * tx.unit_price
    const feesCad = tx.fees * fxToCad

    if (tx.transaction_type === 'BUY' || tx.transaction_type === 'DRIP') {
      const totalCostCad = grossTrade * fxToCad + feesCad
      position.quantity += tx.quantity
      position.cost_basis_cad += totalCostCad
      position.last_trade_price = tx.unit_price
    } else if (tx.transaction_type === 'SELL') {
      const quantityBeforeSell = position.quantity
      if (quantityBeforeSell <= 0) {
        // Ignore invalid sells from earlier incomplete history.
        continue
      }

      const soldQuantity = Math.min(tx.quantity, quantityBeforeSell)
      // Assumption (explicit): realized P/L uses Average Cost basis.
      // Each sell relieves cost proportionally based on position-level average CAD cost per share.
      const averageCostCad = position.cost_basis_cad / quantityBeforeSell
      const relievedCostCad = soldQuantity * averageCostCad
      const proceedsCad = grossTrade * fxToCad - feesCad
      const realizedPnlCad = proceedsCad - relievedCostCad

      realizedRows.push({
        trade_date: tx.trade_date,
        account_type_id: tx.account_type_id,
        account_name: position.account_name,
        ticker: position.security.ticker,
        quantity_sold: round2(soldQuantity),
        proceeds_cad: round2(proceedsCad),
        cost_basis_cad: round2(relievedCostCad),
        realized_pnl_cad: round2(realizedPnlCad),
      })

      position.quantity = Math.max(0, quantityBeforeSell - soldQuantity)
      position.cost_basis_cad = Math.max(0, position.cost_basis_cad - relievedCostCad)
      position.last_trade_price = tx.unit_price
    }

    positions.set(positionKey, position)
  }

  const holdings: DerivedHolding[] = []
  const valuationDate = input.valuationDate

  for (const position of positions.values()) {
    if (position.quantity <= 0) continue

    const quote = input.quoteBySecurityId.get(position.security.id)
    const quoteCurrency = normalizeCurrency(
      quote?.quote_currency ?? position.security.quote_currency ?? CAD_CURRENCY,
    )

    const quoteFxToCad =
      quoteCurrency === CAD_CURRENCY ? 1 : await input.fxToCadResolver(quoteCurrency, valuationDate)

    const currentPrice = quote?.price ?? position.last_trade_price
    const previousClosePrice = quote?.previous_close ?? null
    const marketValueCad = position.quantity * currentPrice * quoteFxToCad
    const previousCloseValueCad =
      previousClosePrice != null
        ? position.quantity * previousClosePrice * quoteFxToCad
        : null

    const dayChangeCad =
      previousCloseValueCad != null
        ? marketValueCad - previousCloseValueCad
        : 0

    const unrealizedPnlCad = marketValueCad - position.cost_basis_cad
    const unrealizedPnlPct =
      position.cost_basis_cad > 0
        ? (unrealizedPnlCad / position.cost_basis_cad) * 100
        : 0

    holdings.push({
      account_type_id: position.account_type_id,
      account_name: position.account_name,
      security_id: position.security.id,
      ticker: position.security.ticker,
      security_name: position.security.name,
      asset_type: position.security.asset_type,
      quantity: round2(position.quantity),
      avg_cost_cad:
        position.quantity > 0
          ? round2(position.cost_basis_cad / position.quantity)
          : 0,
      cost_basis_cad: round2(position.cost_basis_cad),
      current_price: round2(currentPrice),
      current_price_currency: quoteCurrency,
      market_value_cad: round2(marketValueCad),
      previous_close_price: previousClosePrice != null ? round2(previousClosePrice) : null,
      previous_close_value_cad:
        previousCloseValueCad != null ? round2(previousCloseValueCad) : null,
      day_change_cad: round2(dayChangeCad),
      unrealized_pnl_cad: round2(unrealizedPnlCad),
      unrealized_pnl_pct: round2(unrealizedPnlPct),
      allocation_pct: 0,
      quote_as_of: quote?.as_of ?? null,
      price_source:
        quote != null
          ? quote.stale
            ? 'fallback'
            : quote.source === 'yahoo'
              ? 'live'
              : 'cache'
          : 'fallback',
    })
  }

  const totalMarketValue = holdings.reduce((sum, holding) => sum + holding.market_value_cad, 0)
  for (const holding of holdings) {
    holding.allocation_pct =
      totalMarketValue > 0
        ? round2((holding.market_value_cad / totalMarketValue) * 100)
        : 0
  }

  holdings.sort((a, b) => b.market_value_cad - a.market_value_cad)
  realizedRows.sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1))

  return {
    holdings,
    realizedRows,
    totalRealizedCad: round2(realizedRows.reduce((sum, row) => sum + row.realized_pnl_cad, 0)),
  }
}
