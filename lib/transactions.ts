'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { Transaction } from './types'

export async function getTransactions() {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    
  if (error) throw error
  
  // Convert date strings to Date objects
  return data?.map(transaction => ({
    ...transaction,
    date: new Date(transaction.date),
    created_at: transaction.created_at ? new Date(transaction.created_at) : undefined,
    updated_at: transaction.updated_at ? new Date(transaction.updated_at) : undefined,
  })) as Transaction[]
}

export async function createTransaction(data: {
  transaction_type: "debit" | "credit"
  amount: number
  merchant: string
  date: Date
  account_type_id: string
  category: string
  notes?: string
}) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const transactionData = {
    user_id: userId,
    transaction_type: data.transaction_type,
    amount: data.amount,
    merchant: data.merchant,
    date: data.date.toISOString().split('T')[0], // Convert to YYYY-MM-DD format
    account_type_id: data.account_type_id,
    category: data.category,
    notes: data.notes || null,
  }
  
  const { data: result, error } = await supabase
    .from('transactions')
    .insert(transactionData)
    .select()
    .single()
    
  if (error) {
    console.error('Supabase error:', error)
    throw error
  }
  
  return result
}

export async function updateTransaction(id: string, data: Partial<Transaction>) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const updateData: any = {}
  
  if (data.transaction_type) updateData.transaction_type = data.transaction_type
  if (data.amount !== undefined) updateData.amount = data.amount
  if (data.merchant) updateData.merchant = data.merchant
  if (data.date) updateData.date = data.date.toISOString().split('T')[0]
  if (data.account_type_id) updateData.account_type_id = data.account_type_id
  if (data.category) updateData.category = data.category
  if (data.notes !== undefined) updateData.notes = data.notes
  
  updateData.updated_at = new Date().toISOString()
  
  const { data: result, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId) // Ensure user can only update their own transactions
    .select()
    .single()
    
  if (error) {
    console.error('Supabase error:', error)
    throw error
  }
  
  return result
}

export async function deleteTransaction(id: string) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId) // Ensure user can only delete their own transactions
    
  if (error) {
    console.error('Supabase error:', error)
    throw error
  }
  
  return { success: true }
}
