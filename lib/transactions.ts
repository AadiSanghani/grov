'use server'

import { after } from 'next/server'
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

  after(async () => {
    try {
      const account = await getAccountById(data.account_type_id)
      const currentBalance = parseFloat(account.account_balance)
      const accountCategory = account.category || 'asset'
      
      const delta = calculateBalanceDelta(data.transaction_type, data.amount, accountCategory)
      const newBalance = currentBalance + delta
      
      await Promise.all([
        recordTransactionBalance(
          parseInt(data.account_type_id),
          transactionDate,
          data.transaction_type,
          data.amount,
          accountCategory
        ),
        updateAccountBalance(data.account_type_id, newBalance),
      ])
    } catch (balanceError) {
      console.error('Failed to update account balance:', balanceError)
    }
  })
  
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
  
  // Capture values needed for balance bookkeeping before entering after()
  const oldAccountId = oldTransaction.account_type_id
  const newAccountId = data.account_type_id || oldAccountId.toString()
  const oldAmount = oldTransaction.amount
  const newAmount = data.amount !== undefined ? data.amount : oldAmount
  const oldType = oldTransaction.transaction_type as 'outgoing' | 'incoming'
  const newType = (data.transaction_type || oldType) as 'outgoing' | 'incoming'
  const oldDate = oldTransaction.date
  const newDate = data.date ? data.date.toISOString().split('T')[0] : oldDate

  // Schedule balance bookkeeping to run after the response is sent.
  after(async () => {
    try {
      const oldAccount = await getAccountById(oldAccountId)
      const oldAccountCategory = oldAccount.category || 'asset'

      if (oldAccountId.toString() !== newAccountId) {
        // Account changed — reverse on old, apply on new
        const oldAccountBalance = parseFloat(oldAccount.account_balance)
        const oldDelta = calculateBalanceDelta(oldType, oldAmount, oldAccountCategory)
        const reversedBalance = oldAccountBalance - oldDelta

        // Fetch new account in parallel with reversing old account balances
        const [newAccount] = await Promise.all([
          getAccountById(newAccountId),
          // These two write to different tables (account_types vs account_daily_balances)
          updateAccountBalance(oldAccountId, reversedBalance),
          reverseTransactionBalance(
            parseInt(oldAccountId.toString()),
            oldDate,
            oldType,
            oldAmount,
            oldAccountCategory
          ),
        ])

        const newAccountBalance = parseFloat(newAccount.account_balance)
        const newAccountCategory = newAccount.category || 'asset'
        const newDelta = calculateBalanceDelta(newType, newAmount, newAccountCategory)
        const updatedBalance = newAccountBalance + newDelta

        // Apply to new account — again, different tables so parallel
        await Promise.all([
          updateAccountBalance(newAccountId, updatedBalance),
          recordTransactionBalance(
            parseInt(newAccountId),
            newDate,
            newType,
            newAmount,
            newAccountCategory
          ),
        ])
      } else {
        // Same account — reverse old and apply new
        const currentBalance = parseFloat(oldAccount.account_balance)
        const oldDelta = calculateBalanceDelta(oldType, oldAmount, oldAccountCategory)
        const newDelta = calculateBalanceDelta(newType, newAmount, oldAccountCategory)
        const newBalance = currentBalance - oldDelta + newDelta

        // updateAccountBalance (account_types) can run in parallel with
        // the sequential daily balance work (account_daily_balances)
        await Promise.all([
          updateAccountBalance(oldAccountId, newBalance),
          (async () => {
            await reverseTransactionBalance(
              parseInt(oldAccountId.toString()),
              oldDate,
              oldType,
              oldAmount,
              oldAccountCategory
            )
            await recordTransactionBalance(
              parseInt(oldAccountId.toString()),
              newDate,
              newType,
              newAmount,
              oldAccountCategory
            )
          })(),
        ])
      }
    } catch (balanceError) {
      console.error('Failed to update account balance:', balanceError)
    }
  })
  
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
  
  // Schedule balance reversal to run after the response is sent.
  const deletedTransaction = transaction
  after(async () => {
    try {
      const account = await getAccountById(deletedTransaction.account_type_id)
      const currentBalance = parseFloat(account.account_balance)
      const accountCategory = account.category || 'asset'
      const transactionType = deletedTransaction.transaction_type as 'outgoing' | 'incoming'
      
      const delta = calculateBalanceDelta(transactionType, deletedTransaction.amount, accountCategory)
      const newBalance = currentBalance - delta
      
      // These write to different tables (account_types vs account_daily_balances)
      await Promise.all([
        updateAccountBalance(deletedTransaction.account_type_id, newBalance),
        reverseTransactionBalance(
          parseInt(deletedTransaction.account_type_id.toString()),
          deletedTransaction.date,
          transactionType,
          deletedTransaction.amount,
          accountCategory
        ),
      ])
    } catch (balanceError) {
      console.error('Failed to update account balance:', balanceError)
    }
  })
  
  return { success: true }
}
