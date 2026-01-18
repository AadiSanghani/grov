'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { Transaction } from './types'
import { getAccountById, updateAccountBalance } from './accounts'

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
  
  // Update account balance
  try {
    console.log('Transaction created, updating account balance for account:', data.account_type_id)
    const account = await getAccountById(data.account_type_id)
    const currentBalance = parseFloat(account.account_balance)
    
    console.log('Current account balance:', currentBalance)
    
    // Debit decreases balance, credit increases balance
    const newBalance = data.transaction_type === 'debit' 
      ? currentBalance - data.amount 
      : currentBalance + data.amount
    
    console.log('New balance to set:', newBalance)
    
    await updateAccountBalance(data.account_type_id, newBalance)
    console.log('Account balance updated successfully')
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
  
  // Update account balances
  try {
    const oldAccountId = oldTransaction.account_type_id
    const newAccountId = data.account_type_id || oldAccountId
    const oldAmount = oldTransaction.amount
    const newAmount = data.amount !== undefined ? data.amount : oldAmount
    const oldType = oldTransaction.transaction_type
    const newType = data.transaction_type || oldType
    
    // If account changed, we need to reverse the effect on the old account
    if (oldAccountId !== newAccountId) {
      // Reverse old transaction on old account
      const oldAccount = await getAccountById(oldAccountId)
      const oldAccountBalance = parseFloat(oldAccount.account_balance)
      const reversedBalance = oldType === 'debit'
        ? oldAccountBalance + oldAmount  // Reverse debit by adding back
        : oldAccountBalance - oldAmount  // Reverse credit by subtracting
      await updateAccountBalance(oldAccountId, reversedBalance)
      
      // Apply new transaction to new account
      const newAccount = await getAccountById(newAccountId)
      const newAccountBalance = parseFloat(newAccount.account_balance)
      const updatedBalance = newType === 'debit'
        ? newAccountBalance - newAmount
        : newAccountBalance + newAmount
      await updateAccountBalance(newAccountId, updatedBalance)
    } else {
      // Same account, just update the difference
      const account = await getAccountById(oldAccountId)
      const currentBalance = parseFloat(account.account_balance)
      
      // Reverse old transaction effect
      const reversedBalance = oldType === 'debit'
        ? currentBalance + oldAmount
        : currentBalance - oldAmount
      
      // Apply new transaction effect
      const newBalance = newType === 'debit'
        ? reversedBalance - newAmount
        : reversedBalance + newAmount
      
      await updateAccountBalance(oldAccountId, newBalance)
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
  
  // Reverse the transaction's effect on the account balance
  try {
    const account = await getAccountById(transaction.account_type_id)
    const currentBalance = parseFloat(account.account_balance)
    
    // Reverse the transaction effect
    const newBalance = transaction.transaction_type === 'debit'
      ? currentBalance + transaction.amount  // Reverse debit by adding back
      : currentBalance - transaction.amount  // Reverse credit by subtracting
    
    await updateAccountBalance(transaction.account_type_id, newBalance)
  } catch (balanceError) {
    console.error('Failed to update account balance:', balanceError)
    // Note: Transaction is already deleted, so we just log the error
  }
  
  return { success: true }
}
