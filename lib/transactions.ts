'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { Transaction } from './types'
import { createDeductions, deleteDeductionsByTransactionId, getDeductionsByTransactionId } from './deductions'
import { normalizeIncomingSubtype, parseLocalDate, toDateOnlyString } from './utils'

interface TransactionRow {
  id?: string | number
  user_id?: string
  transaction_type: 'outgoing' | 'incoming' | 'transfer'
  incoming_subtype?: 'income' | 'reimbursement' | null
  amount: number
  merchant: string
  date: string
  account_type_id: string | number | null
  category: string
  notes?: string | null
  spending_amount?: number | null
  to_account_type_id?: string | number | null
  affects_balance?: boolean | null
  trip_id?: string | number | null
  trip_entry_id?: string | number | null
  source_type?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function mapTransactionForClient(row: TransactionRow): Transaction {
  return {
    id: row.id != null ? String(row.id) : undefined,
    user_id: row.user_id,
    transaction_type: row.transaction_type,
    incoming_subtype: row.incoming_subtype ?? null,
    amount: Number(row.amount),
    merchant: row.merchant,
    category: row.category,
    notes: row.notes ?? undefined,
    account_type_id: row.account_type_id != null ? String(row.account_type_id) : null,
    to_account_type_id: row.to_account_type_id != null ? String(row.to_account_type_id) : undefined,
    date: parseLocalDate(String(row.date)),
    spending_amount: row.spending_amount ?? null,
    created_at: row.created_at ? new Date(String(row.created_at)) : undefined,
    updated_at: row.updated_at ? new Date(String(row.updated_at)) : undefined,
    affects_balance: row.affects_balance ?? true,
    trip_id: row.trip_id != null ? String(row.trip_id) : null,
    trip_entry_id: row.trip_entry_id != null ? String(row.trip_entry_id) : null,
    source_type: row.source_type ?? null,
  }
}

async function requireUserId() {
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')
  return userId
}

export async function getTransactions() {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
  if (error) throw error
  return data?.map(mapTransactionForClient) as Transaction[]
}

export async function getTransactionsInRange(startDate: string, endDate: string) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('transactions').select('*').eq('user_id', userId)
    .gte('date', startDate).lte('date', endDate).order('date', { ascending: false })
  if (error) throw error
  return data?.map(mapTransactionForClient) as Transaction[]
}

export async function getRecentTransactionsForAccount(accountId: string | number, limit = 10) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const account = String(accountId)
  const { data, error } = await supabase
    .from('transactions').select('*').eq('user_id', userId)
    .or(`account_type_id.eq.${account},to_account_type_id.eq.${account}`)
    .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data?.map(mapTransactionForClient) as Transaction[]
}

export async function createTransaction(data: {
  transaction_type: 'outgoing' | 'incoming' | 'transfer'
  incoming_subtype?: 'income' | 'reimbursement' | null
  amount: number
  merchant: string
  date: Date | string
  account_type_id: string | null
  category: string
  notes?: string
  spending_amount?: number | null
  to_account_type_id?: string | null
  affects_balance?: boolean
  trip_id?: string | null
  trip_entry_id?: string | null
  source_type?: string | null
  deductions?: { label: string; amount: number; target_account_id?: number | null }[]
}) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const isTransfer = data.transaction_type === 'transfer'
  const affectsBalance = data.affects_balance ?? true
  if (isTransfer && (!data.account_type_id || !data.to_account_type_id)) throw new Error('Both accounts are required for a transfer')
  if (!isTransfer && affectsBalance && !data.account_type_id) throw new Error('account_type_id is required when affects_balance is true')

  const row: Record<string, unknown> = {
    user_id: userId, transaction_type: data.transaction_type, amount: data.amount,
    merchant: data.merchant, date: toDateOnlyString(data.date), account_type_id: data.account_type_id,
    category: data.category, notes: data.notes || null, affects_balance: affectsBalance,
    incoming_subtype: data.transaction_type === 'incoming' ? normalizeIncomingSubtype(data.incoming_subtype, data.category) : null,
    spending_amount: data.transaction_type === 'outgoing' && data.spending_amount != null ? data.spending_amount : null,
    trip_id: data.trip_id ?? null, trip_entry_id: data.trip_entry_id ?? null, source_type: data.source_type ?? 'manual',
  }
  if (isTransfer) row.to_account_type_id = data.to_account_type_id

  // Database triggers atomically update the current balance and daily history.
  const { data: result, error } = await supabase.from('transactions').insert(row).select().single()
  if (error) throw error

  const deductions = data.transaction_type === 'incoming' ? data.deductions ?? [] : []
  if (deductions.length > 0 && result?.id) await createDeductions(result.id, deductions)
  return result
}

export async function duplicateTransaction(id: string, date?: Date | string) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const { data: source, error } = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', userId).single()
  if (error) throw error
  if (source.account_type_id == null) throw new Error('Cannot duplicate an unassigned transaction')
  const deductions = source.transaction_type === 'incoming' ? await getDeductionsByTransactionId(id) : []
  return createTransaction({
    transaction_type: source.transaction_type, incoming_subtype: source.incoming_subtype, amount: source.amount,
    merchant: source.merchant ?? 'Transaction Copy', date: date ? toDateOnlyString(date) : toDateOnlyString(new Date()),
    account_type_id: String(source.account_type_id), category: source.category ?? '', notes: source.notes ?? undefined,
    spending_amount: source.spending_amount ?? null,
    to_account_type_id: source.to_account_type_id != null ? String(source.to_account_type_id) : null,
    affects_balance: source.affects_balance ?? true, trip_id: source.trip_id != null ? String(source.trip_id) : null,
    trip_entry_id: source.trip_entry_id != null ? String(source.trip_entry_id) : null, source_type: source.source_type ?? 'manual',
    deductions: deductions.map((d) => ({ label: d.label, amount: d.amount, target_account_id: d.target_account_id ?? null })),
  })
}

export async function updateTransaction(id: string, data: Omit<Partial<Transaction>, 'date'> & {
  date?: Date | string
  deductions?: { label: string; amount: number; target_account_id?: number | null }[]
}) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  const { data: existing, error: fetchError } = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', userId).single()
  if (fetchError) throw fetchError

  const type = (data.transaction_type || existing.transaction_type) as 'outgoing' | 'incoming' | 'transfer'
  const category = data.category ?? existing.category
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.transaction_type) row.transaction_type = data.transaction_type
  if (data.amount !== undefined) row.amount = data.amount
  if (data.merchant) row.merchant = data.merchant
  if (data.date) row.date = toDateOnlyString(data.date)
  if (data.account_type_id !== undefined) row.account_type_id = data.account_type_id
  if (data.category) row.category = data.category
  if (data.notes !== undefined) row.notes = data.notes
  if (data.affects_balance !== undefined) row.affects_balance = data.affects_balance
  if (data.trip_id !== undefined) row.trip_id = data.trip_id
  if (data.trip_entry_id !== undefined) row.trip_entry_id = data.trip_entry_id
  if (data.source_type !== undefined) row.source_type = data.source_type

  if (type === 'incoming') {
    row.incoming_subtype = normalizeIncomingSubtype(data.incoming_subtype ?? existing.incoming_subtype, category)
    row.spending_amount = null
    row.to_account_type_id = null
  } else if (type === 'transfer') {
    row.incoming_subtype = null
    row.spending_amount = null
    if (data.to_account_type_id != null) row.to_account_type_id = data.to_account_type_id
  } else {
    row.incoming_subtype = null
    row.to_account_type_id = null
    if (data.spending_amount !== undefined) row.spending_amount = data.spending_amount
  }

  // The update trigger atomically reverses the old effect and applies the new one.
  const { data: result, error } = await supabase.from('transactions').update(row).eq('id', id).eq('user_id', userId).select().single()
  if (error) throw error

  if (data.deductions !== undefined) {
    await deleteDeductionsByTransactionId(id)
    if (type === 'incoming' && data.deductions.length > 0) await createDeductions(Number(id), data.deductions)
  }
  return result
}

export async function deleteTransaction(id: string) {
  const supabase = createServerSupabaseClient()
  const userId = await requireUserId()
  // The delete trigger reverses both the transaction and any cascading deductions.
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
  return { success: true }
}
