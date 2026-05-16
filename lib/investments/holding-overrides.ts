'use server'

import { auth } from '@clerk/nextjs/server'

import { assertInvestmentAccountOwnership } from '@/lib/investments/accounts'
import { getOrCreateSecurityByTicker } from '@/lib/investments/securities'
import type {
  InvestmentHoldingOverride,
  InvestmentSecurity,
  UpsertInvestmentHoldingOverrideInput,
} from '@/lib/investments/types'
import { normalizeCurrency, normalizeTicker } from '@/lib/investments/utils'
import { createServerSupabaseClient } from '@/ssr/client'

interface HoldingOverrideRow {
  id: number
  user_id: string
  account_type_id: number
  security_id: number
  override_account_type_id: number | null
  override_security_id: number | null
  quantity: string | number | null
  avg_cost: string | number | null
  currency: string | null
  notes: string | null
  created_at: string
  updated_at: string
  investment_securities?: SecurityRow | SecurityRow[] | null
  override_security?: SecurityRow | SecurityRow[] | null
  override_account?: AccountRow | AccountRow[] | null
}

interface SecurityRow {
  id: number
  ticker: string
  yahoo_symbol: string
  name: string | null
  asset_type: string
  quote_currency: string
}

interface AccountRow {
  account_name: string
}

function requireUserId(userId: string | null): string {
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'number' ? value : Number(value)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function mapSecurity(row: SecurityRow | null): InvestmentSecurity | null {
  if (!row) return null

  return {
    id: String(row.id),
    ticker: row.ticker,
    yahoo_symbol: row.yahoo_symbol,
    name: row.name,
    asset_type: row.asset_type,
    quote_currency: row.quote_currency,
  }
}

function mapOverride(row: HoldingOverrideRow): InvestmentHoldingOverride {
  const security = mapSecurity(firstRelation(row.investment_securities))
  const overrideSecurity = mapSecurity(firstRelation(row.override_security))

  return {
    id: String(row.id),
    user_id: row.user_id,
    account_type_id: String(row.account_type_id),
    security_id: String(row.security_id),
    override_account_type_id: row.override_account_type_id == null ? null : String(row.override_account_type_id),
    override_security_id: row.override_security_id == null ? null : String(row.override_security_id),
    quantity: parseNumber(row.quantity),
    avg_cost: parseNumber(row.avg_cost),
    currency: row.currency == null ? null : normalizeCurrency(row.currency),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(security ? { security } : {}),
    override_security: overrideSecurity,
    override_account_name: firstRelation(row.override_account)?.account_name ?? null,
  }
}

function validateInput(input: UpsertInvestmentHoldingOverrideInput): void {
  if (!input.account_type_id) {
    throw new Error('Investment account is required')
  }
  if (!input.override_account_type_id) {
    throw new Error('Display account is required')
  }
  if (!input.security_id) {
    throw new Error('Holding security is required')
  }
  if (!normalizeTicker(input.ticker)) {
    throw new Error('Ticker is required')
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Shares held must be greater than zero')
  }
  if (!Number.isFinite(input.avg_cost) || input.avg_cost < 0) {
    throw new Error('Average cost must be zero or greater')
  }
  if (normalizeCurrency(input.currency).length !== 3) {
    throw new Error('Currency must be a 3-letter code')
  }
}

export async function getInvestmentHoldingOverrides(): Promise<InvestmentHoldingOverride[]> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('investment_holding_overrides')
    .select(`
      id,
      user_id,
      account_type_id,
      security_id,
      override_account_type_id,
      override_security_id,
      quantity,
      avg_cost,
      currency,
      notes,
      created_at,
      updated_at,
      override_account:account_types!investment_holding_overrides_override_account_type_id_fkey (
        account_name
      ),
      investment_securities!investment_holding_overrides_security_id_fkey (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      ),
      override_security:investment_securities!investment_holding_overrides_override_security_id_fkey (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      )
    `)
    .eq('user_id', resolvedUserId)

  if (error) throw error

  return (data as HoldingOverrideRow[] | null ?? []).map(mapOverride)
}

export async function upsertInvestmentHoldingOverride(
  input: UpsertInvestmentHoldingOverrideInput,
): Promise<InvestmentHoldingOverride> {
  validateInput(input)

  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  await assertInvestmentAccountOwnership(input.account_type_id, resolvedUserId)
  await assertInvestmentAccountOwnership(input.override_account_type_id, resolvedUserId)

  const overrideSecurity = await getOrCreateSecurityByTicker({
    ticker: input.ticker,
    quoteCurrency: input.currency,
  })

  const supabase = createServerSupabaseClient()
  const payload = {
    user_id: resolvedUserId,
    account_type_id: Number(input.account_type_id),
    security_id: Number(input.security_id),
    override_account_type_id: Number(input.override_account_type_id),
    override_security_id: Number(overrideSecurity.id),
    quantity: input.quantity,
    avg_cost: input.avg_cost,
    currency: normalizeCurrency(input.currency),
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('investment_holding_overrides')
    .upsert(payload, {
      onConflict: 'user_id,account_type_id,security_id',
    })
    .select(`
      id,
      user_id,
      account_type_id,
      security_id,
      override_account_type_id,
      override_security_id,
      quantity,
      avg_cost,
      currency,
      notes,
      created_at,
      updated_at,
      override_account:account_types!investment_holding_overrides_override_account_type_id_fkey (
        account_name
      ),
      investment_securities!investment_holding_overrides_security_id_fkey (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      ),
      override_security:investment_securities!investment_holding_overrides_override_security_id_fkey (
        id,
        ticker,
        yahoo_symbol,
        name,
        asset_type,
        quote_currency
      )
    `)
    .single()

  if (error) throw error

  return mapOverride(data as HoldingOverrideRow)
}
