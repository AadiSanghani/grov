'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import type { InvestmentAccount } from './types'

interface InvestmentAccountRow {
  id: string
  user_id: string
  name: string
  base_currency: string
  linked_account_type_id: number | null
  created_at: string
  updated_at: string
}

interface AccountTypeRow {
  id: number
  user_id: string
  account_name: string
  account_subtype: string
  account_balance: string
  account_type: string
}

function requireUserId(userId: string | null): string {
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

function mapAccountRow(
  row: InvestmentAccountRow,
  linkedAccount: AccountTypeRow | null,
): InvestmentAccount {
  return {
    id: row.id,
    user_id: row.user_id,
    name: linkedAccount?.account_name ?? row.name,
    base_currency: row.base_currency,
    linked_account_type_id: row.linked_account_type_id,
    linked_account_balance:
      linkedAccount?.account_balance != null
        ? Number(linkedAccount.account_balance)
        : undefined,
    linked_account_subtype: linkedAccount?.account_subtype,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function syncInvestmentAccountsFromAccountTypes(userId: string) {
  const supabase = createServerSupabaseClient()

  const [{ data: sourceAccounts, error: sourceError }, { data: existingRows, error: existingError }] =
    await Promise.all([
      supabase
        .from('account_types')
        .select('id, user_id, account_name, account_subtype, account_balance, account_type')
        .eq('user_id', userId)
        .eq('account_type', 'Investments'),
      supabase
        .from('investment_accounts')
        .select('*')
        .eq('user_id', userId),
    ])

  if (sourceError) throw sourceError
  if (existingError) throw existingError

  const source = (sourceAccounts as AccountTypeRow[]) ?? []
  const existing = (existingRows as InvestmentAccountRow[]) ?? []

  const sourceById = new Map<number, AccountTypeRow>()
  for (const row of source) {
    sourceById.set(row.id, row)
  }

  const existingByLinkedId = new Map<number, InvestmentAccountRow>()
  for (const row of existing) {
    if (row.linked_account_type_id != null) {
      existingByLinkedId.set(row.linked_account_type_id, row)
    }
  }

  const inserts: {
    user_id: string
    name: string
    base_currency: string
    linked_account_type_id: number
  }[] = []
  const renameUpdates: { id: string; name: string }[] = []

  for (const sourceAccount of source) {
    const mapped = existingByLinkedId.get(sourceAccount.id)
    if (!mapped) {
      inserts.push({
        user_id: userId,
        name: sourceAccount.account_name,
        base_currency: 'CAD',
        linked_account_type_id: sourceAccount.id,
      })
      continue
    }

    if (mapped.name !== sourceAccount.account_name) {
      renameUpdates.push({ id: mapped.id, name: sourceAccount.account_name })
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase
      .from('investment_accounts')
      .insert(inserts)
    if (error) throw error
  }

  if (renameUpdates.length > 0) {
    const nowIso = new Date().toISOString()
    await Promise.all(
      renameUpdates.map(async (update) => {
        const { error } = await supabase
          .from('investment_accounts')
          .update({ name: update.name, updated_at: nowIso })
          .eq('id', update.id)
          .eq('user_id', userId)
        if (error) throw error
      }),
    )
  }

  const staleIds = existing
    .filter((row) => {
      if (row.linked_account_type_id == null) return true
      return !sourceById.has(row.linked_account_type_id)
    })
    .map((row) => row.id)

  if (staleIds.length > 0) {
    const { error } = await supabase
      .from('investment_accounts')
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds)
    if (error) throw error
  }
}

export async function getInvestmentAccounts() {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)

  await syncInvestmentAccountsFromAccountTypes(resolvedUserId)

  const [{ data: investmentRows, error: investmentError }, { data: accountTypes, error: accountTypesError }] =
    await Promise.all([
      supabase
        .from('investment_accounts')
        .select('*')
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: true }),
      supabase
        .from('account_types')
        .select('id, user_id, account_name, account_subtype, account_balance, account_type')
        .eq('user_id', resolvedUserId)
        .eq('account_type', 'Investments'),
    ])

  if (investmentError) throw investmentError
  if (accountTypesError) throw accountTypesError

  const accountTypeMap = new Map<number, AccountTypeRow>()
  for (const row of (accountTypes as AccountTypeRow[]) ?? []) {
    accountTypeMap.set(row.id, row)
  }

  return ((investmentRows as InvestmentAccountRow[]) ?? []).map((row) =>
    mapAccountRow(
      row,
      row.linked_account_type_id == null
        ? null
        : accountTypeMap.get(row.linked_account_type_id) ?? null,
    ),
  )
}

export async function updateInvestmentAccount(
  accountId: string,
  input: {
    base_currency?: string
  },
) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.base_currency !== undefined) {
    const currency = input.base_currency.trim().toUpperCase()
    if (!currency) throw new Error('Base currency cannot be empty')
    updates.base_currency = currency
  }

  const { data, error } = await supabase
    .from('investment_accounts')
    .update(updates)
    .eq('id', accountId)
    .eq('user_id', resolvedUserId)
    .select('*')
    .single()

  if (error) throw error

  const row = data as InvestmentAccountRow
  let linkedAccount: AccountTypeRow | null = null
  if (row.linked_account_type_id != null) {
    const { data: accountTypeRow, error: accountTypeError } = await supabase
      .from('account_types')
      .select('id, user_id, account_name, account_subtype, account_balance, account_type')
      .eq('id', row.linked_account_type_id)
      .eq('user_id', resolvedUserId)
      .eq('account_type', 'Investments')
      .maybeSingle()
    if (accountTypeError) throw accountTypeError
    linkedAccount = (accountTypeRow as AccountTypeRow | null) ?? null
  }

  return mapAccountRow(row, linkedAccount)
}

export async function deleteInvestmentAccount(accountId: string) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)

  const { error } = await supabase
    .from('investment_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', resolvedUserId)

  if (error) throw error

  return { success: true }
}

