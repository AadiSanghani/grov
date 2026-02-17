'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import type {
  InvestmentTransaction,
  InvestmentTransactionType,
  Security,
} from './types'

interface SecurityRow {
  id: string
  ticker: string
  name: string | null
  asset_type: string
  quote_currency: string
  created_at: string
}

interface InvestmentTransactionRow {
  id: string
  user_id: string
  account_id: string
  security_id: string
  type: InvestmentTransactionType
  trade_date: string
  quantity: string | number
  price: string | number
  currency: string
  fees: string | number
  fx_rate_to_base: string | number | null
  notes: string | null
  created_at: string
  updated_at: string
  securities?: {
    ticker: string
    name: string | null
    quote_currency: string
  } | {
    ticker: string
    name: string | null
    quote_currency: string
  }[] | null
  investment_accounts?: {
    name: string
    base_currency: string
  } | {
    name: string
    base_currency: string
  }[] | null
}

interface LinkedAccountRow {
  linked_account_type_id: number | null
  base_currency: string
}

interface AccountTypeBalanceRow {
  id: number
  account_balance: string
}

function requireUserId(userId: string | null): string {
  if (!userId) throw new Error('User not authenticated')
  return userId
}

function coerceNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function computeCashDeltaInTradeCurrency(input: {
  type: InvestmentTransactionType
  quantity: number
  price: number
  fees: number
}): number {
  const gross = input.quantity * input.price
  switch (input.type) {
    case 'BUY':
      return -(gross + input.fees)
    case 'SELL':
      return gross - input.fees
    case 'DIVIDEND':
      return input.price - input.fees
    case 'FEE':
      return -(input.price + input.fees)
    default:
      return 0
  }
}

function convertToBaseCurrency(input: {
  amountInTradeCurrency: number
  tradeCurrency: string
  baseCurrency: string
  fxRateToBase?: number | null
}): number {
  const tradeCurrency = input.tradeCurrency.trim().toUpperCase()
  const baseCurrency = input.baseCurrency.trim().toUpperCase()
  if (tradeCurrency === baseCurrency) {
    return input.amountInTradeCurrency
  }

  if (input.fxRateToBase != null && Number(input.fxRateToBase) > 0) {
    return input.amountInTradeCurrency * Number(input.fxRateToBase)
  }

  // Temporary fallback without FX conversion.
  return input.amountInTradeCurrency
}

async function applyCashDeltaToLinkedAccountBalance(input: {
  accountId: string
  userId: string
  type: InvestmentTransactionType
  quantity: number
  price: number
  fees: number
  currency: string
  fxRateToBase?: number | null
}) {
  const supabase = createServerSupabaseClient()

  const { data: linkedAccount, error: linkedAccountError } = await supabase
    .from('investment_accounts')
    .select('linked_account_type_id, base_currency')
    .eq('id', input.accountId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (linkedAccountError) throw linkedAccountError
  if (!linkedAccount) return

  const linked = linkedAccount as LinkedAccountRow
  if (linked.linked_account_type_id == null) return

  const { data: accountType, error: accountTypeError } = await supabase
    .from('account_types')
    .select('id, account_balance')
    .eq('id', linked.linked_account_type_id)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (accountTypeError) throw accountTypeError
  if (!accountType) return

  const accountRow = accountType as AccountTypeBalanceRow
  const currentBalance = Number(accountRow.account_balance || 0)

  const tradeDelta = computeCashDeltaInTradeCurrency({
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees,
  })

  const baseDelta = convertToBaseCurrency({
    amountInTradeCurrency: tradeDelta,
    tradeCurrency: input.currency,
    baseCurrency: linked.base_currency,
    fxRateToBase: input.fxRateToBase,
  })

  const nextBalance = currentBalance + baseDelta

  const { error: updateError } = await supabase
    .from('account_types')
    .update({ account_balance: nextBalance.toString() })
    .eq('id', accountRow.id)
    .eq('user_id', input.userId)

  if (updateError) throw updateError
}

function mapTransactionRow(row: InvestmentTransactionRow): InvestmentTransaction {
  const security = firstRelation(row.securities)
  const account = firstRelation(row.investment_accounts)

  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id,
    security_id: row.security_id,
    type: row.type,
    trade_date: row.trade_date,
    quantity: coerceNumber(row.quantity),
    price: coerceNumber(row.price),
    currency: row.currency,
    fees: coerceNumber(row.fees),
    fx_rate_to_base: row.fx_rate_to_base == null ? null : coerceNumber(row.fx_rate_to_base),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ticker: security?.ticker,
    security_name: security?.name ?? null,
    account_name: account?.name,
    account_base_currency: account?.base_currency,
  }
}

async function ensureSecurity(input: {
  ticker: string
  quoteCurrency: string
  name?: string | null
  assetType?: string
}): Promise<Security> {
  const supabase = createServerSupabaseClient()
  const ticker = input.ticker.trim().toUpperCase()
  if (!ticker) {
    throw new Error('Ticker is required')
  }

  const { data: existing, error: existingError } = await supabase
    .from('securities')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    const existingSecurity = existing as SecurityRow
    return {
      id: existingSecurity.id,
      ticker: existingSecurity.ticker,
      name: existingSecurity.name,
      asset_type: existingSecurity.asset_type,
      quote_currency: existingSecurity.quote_currency,
      created_at: existingSecurity.created_at,
    }
  }

  const quoteCurrency = input.quoteCurrency.trim().toUpperCase()

  const { data, error } = await supabase
    .from('securities')
    .insert({
      ticker,
      name: input.name?.trim() || null,
      asset_type: input.assetType?.trim() || 'stock',
      quote_currency: quoteCurrency || 'USD',
    })
    .select('*')
    .single()

  if (error) throw error

  const row = data as SecurityRow
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    asset_type: row.asset_type,
    quote_currency: row.quote_currency,
    created_at: row.created_at,
  }
}

export async function getInvestmentTransactions(input?: {
  accountId?: string
  limit?: number
}) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)

  let query = supabase
    .from('investment_transactions')
    .select(`
      id,
      user_id,
      account_id,
      security_id,
      type,
      trade_date,
      quantity,
      price,
      currency,
      fees,
      fx_rate_to_base,
      notes,
      created_at,
      updated_at,
      securities (
        ticker,
        name,
        quote_currency
      ),
      investment_accounts (
        name,
        base_currency
      )
    `)
    .eq('user_id', resolvedUserId)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (input?.accountId) {
    query = query.eq('account_id', input.accountId)
  }

  if (input?.limit != null) {
    query = query.limit(input.limit)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as InvestmentTransactionRow[]).map(mapTransactionRow)
}

export async function createInvestmentTransaction(input: {
  account_id: string
  ticker: string
  type: InvestmentTransactionType
  trade_date: string
  quantity: number
  price: number
  currency: string
  fees?: number
  fx_rate_to_base?: number | null
  notes?: string | null
}) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)

  if (!input.account_id) throw new Error('Account is required')
  if (!input.trade_date) throw new Error('Trade date is required')

  const { data: account, error: accountError } = await supabase
    .from('investment_accounts')
    .select('id, linked_account_type_id')
    .eq('id', input.account_id)
    .eq('user_id', resolvedUserId)
    .maybeSingle()

  if (accountError) throw accountError
  if (!account) throw new Error('Investment account not found')

  const transactionType = input.type
  const isTradeType = transactionType === 'BUY' || transactionType === 'SELL'
  const quantity = Number(input.quantity)
  const price = Number(input.price)
  const fees = Number(input.fees ?? 0)
  const currency = input.currency.trim().toUpperCase()
  const fxRateToBase =
    input.fx_rate_to_base == null ? null : Number(input.fx_rate_to_base)

  if (isTradeType && quantity <= 0) {
    throw new Error('Quantity must be greater than zero for BUY/SELL')
  }
  if (!isTradeType && quantity < 0) {
    throw new Error('Quantity cannot be negative')
  }
  if (price <= 0) {
    throw new Error('Price/amount must be greater than zero')
  }
  if (fees < 0) {
    throw new Error('Fees cannot be negative')
  }
  if (fxRateToBase != null && (!Number.isFinite(fxRateToBase) || fxRateToBase <= 0)) {
    throw new Error('fx_rate_to_base must be greater than zero when provided')
  }

  const security = await ensureSecurity({
    ticker: input.ticker,
    quoteCurrency: currency,
  })

  const { data, error } = await supabase
    .from('investment_transactions')
    .insert({
      user_id: resolvedUserId,
      account_id: input.account_id,
      security_id: security.id,
      type: transactionType,
      trade_date: input.trade_date,
      quantity,
      price,
      currency,
      fees,
      fx_rate_to_base: fxRateToBase,
      notes: input.notes?.trim() || null,
    })
    .select(`
      id,
      user_id,
      account_id,
      security_id,
      type,
      trade_date,
      quantity,
      price,
      currency,
      fees,
      fx_rate_to_base,
      notes,
      created_at,
      updated_at,
      securities (
        ticker,
        name,
        quote_currency
      ),
      investment_accounts (
        name,
        base_currency
      )
    `)
    .single()

  if (error) throw error

  await applyCashDeltaToLinkedAccountBalance({
    accountId: input.account_id,
    userId: resolvedUserId,
    type: transactionType,
    quantity,
    price,
    fees,
    currency,
    fxRateToBase,
  })

  return mapTransactionRow(data as InvestmentTransactionRow)
}
