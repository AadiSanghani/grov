'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { PayrollDeduction } from './types'

export async function createDeductions(
  transactionId: number,
  deductions: { label: string; amount: number; target_account_id?: number | null }[]
): Promise<PayrollDeduction[]> {
  if (deductions.length === 0) return []

  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const rows = deductions.map((d) => ({
    transaction_id: transactionId,
    user_id: userId,
    label: d.label,
    amount: d.amount,
    target_account_id: d.target_account_id ?? null,
  }))

  const { data, error } = await supabase
    .from('payroll_deductions')
    .insert(rows)
    .select()

  if (error) {
    console.error('Supabase error creating deductions:', error)
    throw error
  }

  return (data ?? []) as PayrollDeduction[]
}

/**
 * Get all deductions for a single transaction.
 */
export async function getDeductionsByTransactionId(
  transactionId: number | string
): Promise<PayrollDeduction[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('payroll_deductions')
    .select('*')
    .eq('transaction_id', Number(transactionId))
    .eq('user_id', userId)

  if (error) {
    console.error('Supabase error fetching deductions:', error)
    throw error
  }

  return (data ?? []) as PayrollDeduction[]
}

/**
 * Get deductions for multiple transactions at once (batch).
 * Returns a map of transaction_id -> PayrollDeduction[].
 */
export async function getDeductionsForTransactions(
  transactionIds: (number | string)[]
): Promise<Record<string, PayrollDeduction[]>> {
  if (transactionIds.length === 0) return {}

  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const numericIds = transactionIds.map((id) => Number(id))

  const { data, error } = await supabase
    .from('payroll_deductions')
    .select('*')
    .in('transaction_id', numericIds)
    .eq('user_id', userId)

  if (error) {
    console.error('Supabase error fetching deductions batch:', error)
    throw error
  }

  const map: Record<string, PayrollDeduction[]> = {}
  for (const row of data ?? []) {
    const key = String(row.transaction_id)
    if (!map[key]) map[key] = []
    map[key].push(row as PayrollDeduction)
  }

  return map
}

/**
 * Delete all deductions for a transaction.
 * Used when updating or deleting the parent transaction.
 */
export async function deleteDeductionsByTransactionId(
  transactionId: number | string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('payroll_deductions')
    .delete()
    .eq('transaction_id', Number(transactionId))
    .eq('user_id', userId)

  if (error) {
    console.error('Supabase error deleting deductions:', error)
    throw error
  }
}
