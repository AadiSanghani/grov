'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import type {
  CreateEquityGrantInput,
  EquityGrant,
  UpdateEquityGrantInput,
} from '@/lib/investments/types'

interface EquityGrantRow {
  id: number
  user_id: string
  company_name: string
  grant_name: string
  symbol: string | null
  total_shares: string | number
  vested_shares: string | number
  unvested_shares: string | number
  grant_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function requireUserId(userId: string | null): string {
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

function parseNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

function mapRow(row: EquityGrantRow): EquityGrant {
  return {
    id: String(row.id),
    user_id: row.user_id,
    company_name: row.company_name,
    grant_name: row.grant_name,
    symbol: row.symbol,
    total_shares: parseNumber(row.total_shares),
    vested_shares: parseNumber(row.vested_shares),
    unvested_shares: parseNumber(row.unvested_shares),
    grant_date: row.grant_date,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getEquityGrants(): Promise<EquityGrant[]> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('equity_grants')
    .select('*')
    .eq('user_id', resolvedUserId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data as EquityGrantRow[] | null ?? []).map(mapRow)
}

export async function createEquityGrant(input: CreateEquityGrantInput): Promise<EquityGrant> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  if (!input.company_name?.trim()) {
    throw new Error('company_name is required')
  }

  if (!input.grant_name?.trim()) {
    throw new Error('grant_name is required')
  }

  const totalShares = Number(input.total_shares ?? 0)
  const vestedShares = Number(input.vested_shares ?? 0)
  const unvestedShares = Number(input.unvested_shares ?? Math.max(0, totalShares - vestedShares))

  if (!Number.isFinite(totalShares) || totalShares < 0) {
    throw new Error('total_shares must be zero or greater')
  }

  if (!Number.isFinite(vestedShares) || vestedShares < 0) {
    throw new Error('vested_shares must be zero or greater')
  }

  if (!Number.isFinite(unvestedShares) || unvestedShares < 0) {
    throw new Error('unvested_shares must be zero or greater')
  }

  const { data, error } = await supabase
    .from('equity_grants')
    .insert({
      user_id: resolvedUserId,
      company_name: input.company_name.trim(),
      grant_name: input.grant_name.trim(),
      symbol: input.symbol?.trim().toUpperCase() || null,
      total_shares: totalShares,
      vested_shares: vestedShares,
      unvested_shares: unvestedShares,
      grant_date: input.grant_date ?? null,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error) throw error

  return mapRow(data as EquityGrantRow)
}

export async function updateEquityGrant(
  grantId: string,
  input: UpdateEquityGrantInput,
): Promise<EquityGrant> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.company_name !== undefined) updates.company_name = input.company_name.trim()
  if (input.grant_name !== undefined) updates.grant_name = input.grant_name.trim()
  if (input.symbol !== undefined) updates.symbol = input.symbol?.trim().toUpperCase() || null
  if (input.total_shares !== undefined) updates.total_shares = input.total_shares
  if (input.vested_shares !== undefined) updates.vested_shares = input.vested_shares
  if (input.unvested_shares !== undefined) updates.unvested_shares = input.unvested_shares
  if (input.grant_date !== undefined) updates.grant_date = input.grant_date
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null

  const { data, error } = await supabase
    .from('equity_grants')
    .update(updates)
    .eq('id', Number(grantId))
    .eq('user_id', resolvedUserId)
    .select('*')
    .single()

  if (error) throw error

  return mapRow(data as EquityGrantRow)
}

export async function deleteEquityGrant(grantId: string): Promise<{ success: boolean }> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('equity_grants')
    .delete()
    .eq('id', Number(grantId))
    .eq('user_id', resolvedUserId)

  if (error) throw error

  return { success: true }
}
