'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import { assertInvestmentAccountOwnership } from '@/lib/investments/accounts'
import { getOrCreateSecurityByTicker } from '@/lib/investments/securities'
import type {
  CreateInvestmentTransactionInput,
  InvestmentTransaction,
  UpdateInvestmentTransactionInput,
} from '@/lib/investments/types'
import { isDateOnly, normalizeCurrency, normalizeTicker, toIsoDate } from '@/lib/investments/utils'

interface InvestmentTransactionRow {
  id: number
  user_id: string
  account_type_id: number
  security_id: number
  transaction_type: 'BUY' | 'SELL' | 'DRIP'
  trade_date: string
  quantity: string | number
  unit_price: string | number
  fees: string | number
  trade_currency: string
  fx_rate_to_cad: string | number | null
  notes: string | null
  created_at: string
  updated_at: string
  investment_securities?: {
    id: number
    ticker: string
    yahoo_symbol: string
    name: string | null
    asset_type: string
    quote_currency: string
  } | {
    id: number
    ticker: string
    yahoo_symbol: string
    name: string | null
    asset_type: string
    quote_currency: string
  }[] | null
  account_types?: {
    account_name: string
  } | {
    account_name: string
  }[] | null
}

function requireUserId(userId: string | null): string {
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

function parseNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function mapRow(row: InvestmentTransactionRow): InvestmentTransaction {
  const security = firstRelation(row.investment_securities)
  const account = firstRelation(row.account_types)

  return {
    id: String(row.id),
    user_id: row.user_id,
    account_type_id: String(row.account_type_id),
    security_id: String(row.security_id),
    transaction_type: row.transaction_type,
    trade_date: row.trade_date,
    quantity: parseNumber(row.quantity),
    unit_price: parseNumber(row.unit_price),
    fees: parseNumber(row.fees),
    trade_currency: normalizeCurrency(row.trade_currency),
    fx_rate_to_cad: row.fx_rate_to_cad == null ? null : parseNumber(row.fx_rate_to_cad),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    security: security
      ? {
          id: String(security.id),
          ticker: security.ticker,
          yahoo_symbol: security.yahoo_symbol,
          name: security.name,
          asset_type: security.asset_type,
          quote_currency: security.quote_currency,
        }
      : undefined,
    account_name: account?.account_name,
  }
}

function validateCreateInput(input: CreateInvestmentTransactionInput): void {
  if (!input.account_type_id) {
    throw new Error('Investment account is required')
  }

  if (!normalizeTicker(input.ticker)) {
    throw new Error('Ticker is required')
  }

  if (!['BUY', 'SELL', 'DRIP'].includes(input.transaction_type)) {
    throw new Error('Invalid transaction type')
  }

  if (!isDateOnly(input.trade_date)) {
    throw new Error('trade_date must be YYYY-MM-DD')
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero')
  }

  if (!Number.isFinite(input.unit_price) || input.unit_price < 0) {
    throw new Error('Unit price must be zero or greater')
  }

  if (input.fees != null && (!Number.isFinite(input.fees) || input.fees < 0)) {
    throw new Error('Fees must be zero or greater')
  }

  if (input.fx_rate_to_cad != null && (!Number.isFinite(input.fx_rate_to_cad) || input.fx_rate_to_cad <= 0)) {
    throw new Error('fx_rate_to_cad must be greater than zero when provided')
  }
}

function validateUpdateInput(input: UpdateInvestmentTransactionInput): void {
  if (input.trade_date != null && !isDateOnly(input.trade_date)) {
    throw new Error('trade_date must be YYYY-MM-DD')
  }

  if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
    throw new Error('Quantity must be greater than zero')
  }

  if (input.unit_price != null && (!Number.isFinite(input.unit_price) || input.unit_price < 0)) {
    throw new Error('Unit price must be zero or greater')
  }

  if (input.fees != null && (!Number.isFinite(input.fees) || input.fees < 0)) {
    throw new Error('Fees must be zero or greater')
  }

  if (input.fx_rate_to_cad != null && (!Number.isFinite(input.fx_rate_to_cad) || input.fx_rate_to_cad <= 0)) {
    throw new Error('fx_rate_to_cad must be greater than zero when provided')
  }
}

export async function getInvestmentTransactions(input?: {
  accountTypeId?: string
  securityId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<InvestmentTransaction[]> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('investment_transactions')
    .select(`
      id,
      user_id,
      account_type_id,
      security_id,
      transaction_type,
      trade_date,
      quantity,
      unit_price,
      fees,
      trade_currency,
      fx_rate_to_cad,
      notes,
      created_at,
      updated_at,
      investment_securities (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      ),
      account_types (
        account_name
      )
    `)
    .eq('user_id', resolvedUserId)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (input?.accountTypeId) {
    query = query.eq('account_type_id', Number(input.accountTypeId))
  }

  if (input?.securityId) {
    query = query.eq('security_id', Number(input.securityId))
  }

  if (input?.startDate) {
    query = query.gte('trade_date', toIsoDate(input.startDate))
  }

  if (input?.endDate) {
    query = query.lte('trade_date', toIsoDate(input.endDate))
  }

  if (input?.limit != null) {
    query = query.limit(input.limit)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as InvestmentTransactionRow[] | null ?? []).map(mapRow)
}

export async function createInvestmentTransaction(
  input: CreateInvestmentTransactionInput,
): Promise<InvestmentTransaction> {
  validateCreateInput(input)

  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  await assertInvestmentAccountOwnership(input.account_type_id, resolvedUserId)

  const security = await getOrCreateSecurityByTicker({
    ticker: input.ticker,
    quoteCurrency: input.trade_currency,
  })

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('investment_transactions')
    .insert({
      user_id: resolvedUserId,
      account_type_id: Number(input.account_type_id),
      security_id: Number(security.id),
      transaction_type: input.transaction_type,
      trade_date: toIsoDate(input.trade_date),
      quantity: input.quantity,
      unit_price: input.unit_price,
      fees: input.fees ?? 0,
      trade_currency: normalizeCurrency(input.trade_currency),
      fx_rate_to_cad: input.fx_rate_to_cad ?? null,
      notes: input.notes?.trim() || null,
    })
    .select(`
      id,
      user_id,
      account_type_id,
      security_id,
      transaction_type,
      trade_date,
      quantity,
      unit_price,
      fees,
      trade_currency,
      fx_rate_to_cad,
      notes,
      created_at,
      updated_at,
      investment_securities (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      ),
      account_types (
        account_name
      )
    `)
    .single()

  if (error) throw error

  return mapRow(data as InvestmentTransactionRow)
}

export async function updateInvestmentTransaction(
  transactionId: string,
  input: UpdateInvestmentTransactionInput,
): Promise<InvestmentTransaction> {
  validateUpdateInput(input)

  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { data: existing, error: existingError } = await supabase
    .from('investment_transactions')
    .select('id, user_id')
    .eq('id', Number(transactionId))
    .eq('user_id', resolvedUserId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) {
    throw new Error('Investment transaction not found')
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.transaction_type != null) {
    updates.transaction_type = input.transaction_type
  }
  if (input.trade_date != null) {
    updates.trade_date = toIsoDate(input.trade_date)
  }
  if (input.quantity != null) {
    updates.quantity = input.quantity
  }
  if (input.unit_price != null) {
    updates.unit_price = input.unit_price
  }
  if (input.fees != null) {
    updates.fees = input.fees
  }
  if (input.trade_currency != null) {
    updates.trade_currency = normalizeCurrency(input.trade_currency)
  }
  if (input.fx_rate_to_cad !== undefined) {
    updates.fx_rate_to_cad = input.fx_rate_to_cad
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes?.trim() || null
  }

  const { data, error } = await supabase
    .from('investment_transactions')
    .update(updates)
    .eq('id', Number(transactionId))
    .eq('user_id', resolvedUserId)
    .select(`
      id,
      user_id,
      account_type_id,
      security_id,
      transaction_type,
      trade_date,
      quantity,
      unit_price,
      fees,
      trade_currency,
      fx_rate_to_cad,
      notes,
      created_at,
      updated_at,
      investment_securities (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      ),
      account_types (
        account_name
      )
    `)
    .single()

  if (error) throw error

  return mapRow(data as InvestmentTransactionRow)
}

export async function deleteInvestmentTransaction(transactionId: string): Promise<{ success: boolean }> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('investment_transactions')
    .delete()
    .eq('id', Number(transactionId))
    .eq('user_id', resolvedUserId)

  if (error) throw error

  return { success: true }
}
