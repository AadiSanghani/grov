'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { Transaction } from './types'
import { getAccountById, updateAccountBalance } from './accounts'
import { 
  ensureDailyBalance, 
  rippleForwardBalances,
  recordTransactionBalance,
  reverseTransactionBalance
} from './balances'
import { calculateBalanceDelta, getCategoryFromAccountType } from './utils'

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
  
  // Convert date strings to Date objects and ensure account_type_id is a string
  return data?.map(transaction => ({
    ...transaction,
    account_type_id: transaction.account_type_id.toString(),
    date: new Date(transaction.date),
    created_at: transaction.created_at ? new Date(transaction.created_at) : undefined,
    updated_at: transaction.updated_at ? new Date(transaction.updated_at) : undefined,
  })) as Transaction[]
}

export async function getTransactionsInRange(startDate: string, endDate: string) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (error) throw error

  return data?.map(transaction => ({
    ...transaction,
    account_type_id: transaction.account_type_id.toString(),
    date: new Date(transaction.date),
    created_at: transaction.created_at ? new Date(transaction.created_at) : undefined,
    updated_at: transaction.updated_at ? new Date(transaction.updated_at) : undefined,
  })) as Transaction[]
}

export async function createTransaction(data: {
  transaction_type: "outgoing" | "incoming"
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
  
  const transactionDate = data.date.toISOString().split('T')[0] // YYYY-MM-DD
  
  const transactionData = {
    user_id: userId,
    transaction_type: data.transaction_type,
    amount: data.amount,
    merchant: data.merchant,
    date: transactionDate,
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
  
  // Update account balance and daily balance history
  try {
    const account = await getAccountById(data.account_type_id)
    const currentBalance = parseFloat(account.account_balance)
    const accountCategory = account.category || 'asset'
    
    // Calculate delta based on account category
    const delta = calculateBalanceDelta(data.transaction_type, data.amount, accountCategory)
    const newBalance = currentBalance + delta
    
    // IMPORTANT: Record daily balance BEFORE updating account balance
    // This ensures ensureDailyBalance uses the pre-transaction balance
    await recordTransactionBalance(
      parseInt(data.account_type_id),
      transactionDate,
      data.transaction_type,
      data.amount,
      accountCategory
    )
    
    // Update current account balance AFTER recording daily balances
    await updateAccountBalance(data.account_type_id, newBalance)
  } catch (balanceError) {
    console.error('Failed to update account balance:', balanceError)
    // Note: Transaction is already created, so we just log the error
  }
  
  return result
}

export async function updateTransaction(id: string, data: Partial<Transaction>) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Get the old transaction to reverse its effect on the account balance
  const { data: oldTransaction, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
    
  if (fetchError) {
    console.error('Supabase error:', fetchError)
    throw fetchError
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
  
  // Update account balances and daily balance history
  try {
    const oldAccountId = oldTransaction.account_type_id
    const newAccountId = data.account_type_id || oldAccountId.toString()
    const oldAmount = oldTransaction.amount
    const newAmount = data.amount !== undefined ? data.amount : oldAmount
    const oldType = oldTransaction.transaction_type as 'outgoing' | 'incoming'
    const newType = (data.transaction_type || oldType) as 'outgoing' | 'incoming'
    const oldDate = oldTransaction.date
    const newDate = data.date ? data.date.toISOString().split('T')[0] : oldDate
    
    // Get account categories
    const oldAccount = await getAccountById(oldAccountId)
    const oldAccountCategory = oldAccount.category || 'asset'
    
    // If account changed, we need to reverse the effect on the old account
    if (oldAccountId.toString() !== newAccountId) {
      // Reverse old transaction on old account
      const oldAccountBalance = parseFloat(oldAccount.account_balance)
      const oldDelta = calculateBalanceDelta(oldType, oldAmount, oldAccountCategory)
      const reversedBalance = oldAccountBalance - oldDelta
      await updateAccountBalance(oldAccountId, reversedBalance)
      
      // Reverse in daily balance history
      await reverseTransactionBalance(
        parseInt(oldAccountId.toString()),
        oldDate,
        oldType,
        oldAmount,
        oldAccountCategory
      )
      
      // Apply new transaction to new account
      const newAccount = await getAccountById(newAccountId)
      const newAccountBalance = parseFloat(newAccount.account_balance)
      const newAccountCategory = newAccount.category || 'asset'
      const newDelta = calculateBalanceDelta(newType, newAmount, newAccountCategory)
      const updatedBalance = newAccountBalance + newDelta
      await updateAccountBalance(newAccountId, updatedBalance)
      
      // Record in new account's daily balance history
      await recordTransactionBalance(
        parseInt(newAccountId),
        newDate,
        newType,
        newAmount,
        newAccountCategory
      )
    } else {
      // Same account - reverse old and apply new
      const currentBalance = parseFloat(oldAccount.account_balance)
      
      // Calculate old and new deltas
      const oldDelta = calculateBalanceDelta(oldType, oldAmount, oldAccountCategory)
      const newDelta = calculateBalanceDelta(newType, newAmount, oldAccountCategory)
      
      // Update current balance
      const newBalance = currentBalance - oldDelta + newDelta
      await updateAccountBalance(oldAccountId, newBalance)
      
      // Update daily balance history
      // First reverse the old transaction from old date
      await reverseTransactionBalance(
        parseInt(oldAccountId.toString()),
        oldDate,
        oldType,
        oldAmount,
        oldAccountCategory
      )
      
      // Then apply the new transaction from new date
      await recordTransactionBalance(
        parseInt(oldAccountId.toString()),
        newDate,
        newType,
        newAmount,
        oldAccountCategory
      )
    }
  } catch (balanceError) {
    console.error('Failed to update account balance:', balanceError)
    // Note: Transaction is already updated, so we just log the error
  }
  
  return result
}

export async function deleteTransaction(id: string) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Get the transaction to reverse its effect on the account balance
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
    
  if (fetchError) {
    console.error('Supabase error:', fetchError)
    throw fetchError
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
  
  // Reverse the transaction's effect on the account balance and daily balance history
  try {
    const account = await getAccountById(transaction.account_type_id)
    const currentBalance = parseFloat(account.account_balance)
    const accountCategory = account.category || 'asset'
    const transactionType = transaction.transaction_type as 'outgoing' | 'incoming'
    
    // Calculate the delta that was applied and reverse it
    const delta = calculateBalanceDelta(transactionType, transaction.amount, accountCategory)
    const newBalance = currentBalance - delta
    
    await updateAccountBalance(transaction.account_type_id, newBalance)
    
    // Reverse in daily balance history
    await reverseTransactionBalance(
      parseInt(transaction.account_type_id.toString()),
      transaction.date,
      transactionType,
      transaction.amount,
      accountCategory
    )
  } catch (balanceError) {
    console.error('Failed to update account balance:', balanceError)
    // Note: Transaction is already deleted, so we just log the error
  }
  
  return { success: true }
}
