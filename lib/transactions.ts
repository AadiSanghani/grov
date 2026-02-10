'use server'

import { after } from 'next/server'
import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { Transaction } from './types'
import { getAccountById, updateAccountBalance } from './accounts'
import { 
  recordTransactionBalance,
  reverseTransactionBalance
} from './balances'
import {
  createDeductions,
  getDeductionsByTransactionId,
  deleteDeductionsByTransactionId,
} from './deductions'
import { calculateBalanceDelta, toLocalDateString, parseLocalDate } from './utils'

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
  
  return data?.map(transaction => ({
    ...transaction,
    account_type_id: transaction.account_type_id.toString(),
    to_account_type_id: transaction.to_account_type_id != null ? transaction.to_account_type_id.toString() : undefined,
    date: parseLocalDate(transaction.date),
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
    to_account_type_id: transaction.to_account_type_id != null ? transaction.to_account_type_id.toString() : undefined,
    date: parseLocalDate(transaction.date),
    created_at: transaction.created_at ? new Date(transaction.created_at) : undefined,
    updated_at: transaction.updated_at ? new Date(transaction.updated_at) : undefined,
  })) as Transaction[]
}

export async function createTransaction(data: {
  transaction_type: "outgoing" | "incoming" | "transfer"
  amount: number
  merchant: string
  date: Date
  account_type_id: string
  category: string
  notes?: string
  spending_amount?: number | null
  to_account_type_id?: string | null
  deductions?: { label: string; amount: number; target_account_id?: number | null }[]
}) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const transactionDate = toLocalDateString(data.date)
  
  const isTransfer = data.transaction_type === 'transfer'
  if (isTransfer && !data.to_account_type_id) {
    throw new Error('to_account_type_id is required when transaction_type is transfer')
  }
  
  const transactionData: Record<string, unknown> = {
    user_id: userId,
    transaction_type: data.transaction_type,
    amount: data.amount,
    merchant: data.merchant,
    date: transactionDate,
    account_type_id: data.account_type_id,
    category: data.category,
    notes: data.notes || null,
    spending_amount: (data.transaction_type === 'outgoing' && data.spending_amount != null)
      ? data.spending_amount
      : null,
  }
  if (isTransfer) {
    transactionData.to_account_type_id = data.to_account_type_id
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

  // Insert payroll deductions if provided (only for incoming transactions)
  const deductionsInput = data.transaction_type === 'incoming' && data.deductions?.length
    ? data.deductions
    : []
  if (deductionsInput.length > 0 && result?.id) {
    try {
      await createDeductions(result.id, deductionsInput)
    } catch (dedError) {
      console.error('Failed to create payroll deductions:', dedError)
    }
  }

  const deductionsForBalance = deductionsInput.filter((d) => d.target_account_id)

  after(async () => {
    try {
      if (isTransfer && data.to_account_type_id) {
        // Transfer: update both from and to accounts
        const [fromAccount, toAccount] = await Promise.all([
          getAccountById(data.account_type_id),
          getAccountById(data.to_account_type_id),
        ])
        const fromCategory = fromAccount.category || 'asset'
        const toCategory = toAccount.category || 'asset'
        const fromDelta = calculateBalanceDelta('outgoing', data.amount, fromCategory)
        const toDelta = calculateBalanceDelta('incoming', data.amount, toCategory)
        const fromBalance = parseFloat(fromAccount.account_balance)
        const toBalance = parseFloat(toAccount.account_balance)
        
        await Promise.all([
          updateAccountBalance(data.account_type_id, fromBalance + fromDelta),
          updateAccountBalance(data.to_account_type_id, toBalance + toDelta),
          recordTransactionBalance(
            parseInt(data.account_type_id, 10),
            transactionDate,
            'outgoing',
            data.amount,
            fromCategory
          ),
          recordTransactionBalance(
            parseInt(data.to_account_type_id, 10),
            transactionDate,
            'incoming',
            data.amount,
            toCategory
          ),
        ])
      } else {
        // Single-account: outgoing or incoming (not transfer)
        const singleType = data.transaction_type as 'outgoing' | 'incoming'
        const account = await getAccountById(data.account_type_id)
        const currentBalance = parseFloat(account.account_balance)
        const accountCategory = account.category || 'asset'
        const delta = calculateBalanceDelta(singleType, data.amount, accountCategory)
        const newBalance = currentBalance + delta
        
        await Promise.all([
          recordTransactionBalance(
            parseInt(data.account_type_id, 10),
            transactionDate,
            singleType,
            data.amount,
            accountCategory
          ),
          updateAccountBalance(data.account_type_id, newBalance),
        ])
      }

      for (const ded of deductionsForBalance) {
        if (!ded.target_account_id) continue
        const targetAcc = await getAccountById(ded.target_account_id)
        const targetCategory = targetAcc.category || 'asset'
        const targetBalance = parseFloat(targetAcc.account_balance)
        const targetDelta = calculateBalanceDelta('incoming', ded.amount, targetCategory)
        await Promise.all([
          updateAccountBalance(ded.target_account_id, targetBalance + targetDelta),
          recordTransactionBalance(
            ded.target_account_id,
            transactionDate,
            'incoming',
            ded.amount,
            targetCategory
          ),
        ])
      }
    } catch (balanceError) {
      console.error('Failed to update account balance:', balanceError)
    }
  })
  
  return result
}

export async function updateTransaction(
  id: string,
  data: Partial<Transaction> & {
    deductions?: { label: string; amount: number; target_account_id?: number | null }[]
  }
) {
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

  // Fetch old deductions for reversal
  let oldDeductions: { amount: number; target_account_id: number | null }[] = []
  if (oldTransaction.transaction_type === 'incoming') {
    try {
      const deds = await getDeductionsByTransactionId(id)
      oldDeductions = deds
        .filter((d) => d.target_account_id)
        .map((d) => ({ amount: d.amount, target_account_id: d.target_account_id ?? null }))
    } catch (e) {
      console.error('Failed to fetch old deductions:', e)
    }
  }
  
  const updateData: any = {}
  
  if (data.transaction_type) updateData.transaction_type = data.transaction_type
  if (data.amount !== undefined) updateData.amount = data.amount
  if (data.merchant) updateData.merchant = data.merchant
  if (data.date) updateData.date = toLocalDateString(data.date)
  if (data.account_type_id) updateData.account_type_id = data.account_type_id
  if (data.category) updateData.category = data.category
  if (data.notes !== undefined) updateData.notes = data.notes
  
  const effectiveType = (data.transaction_type || oldTransaction.transaction_type) as 'outgoing' | 'incoming' | 'transfer'
  if (effectiveType === 'incoming') {
    updateData.spending_amount = null
    updateData.to_account_type_id = null
  } else if (effectiveType === 'transfer') {
    if (data.to_account_type_id != null) updateData.to_account_type_id = data.to_account_type_id
    updateData.spending_amount = null
  } else {
    updateData.to_account_type_id = null
    if (data.spending_amount !== undefined) updateData.spending_amount = data.spending_amount
  }

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

  // Replace deductions if provided
  const newDeductionsInput = effectiveType === 'incoming' && data.deductions
    ? data.deductions
    : []
  // Delete old deductions and insert new ones
  if (data.deductions !== undefined) {
    try {
      await deleteDeductionsByTransactionId(id)
      if (newDeductionsInput.length > 0) {
        await createDeductions(Number(id), newDeductionsInput)
      }
    } catch (dedError) {
      console.error('Failed to update deductions:', dedError)
    }
  }

  const newDeductionsForBalance = newDeductionsInput.filter((d) => d.target_account_id)
  
  // Capture values needed for balance bookkeeping before entering after()
  const oldFromId = oldTransaction.account_type_id
  const oldToId = oldTransaction.to_account_type_id != null ? oldTransaction.to_account_type_id.toString() : null
  const oldWasTransfer = oldTransaction.transaction_type === 'transfer'
  const newFromId = (data.account_type_id || oldFromId).toString()
  const newToId = effectiveType === 'transfer'
    ? (data.to_account_type_id ?? (result?.to_account_type_id != null ? String(result.to_account_type_id) : null) ?? oldToId)
    : null
  const newIsTransfer = effectiveType === 'transfer'
  const oldAmount = oldTransaction.amount
  const newAmount = data.amount !== undefined ? data.amount : oldAmount
  const oldDate = oldTransaction.date
  const newDate = data.date ? toLocalDateString(data.date) : oldDate

  // Schedule balance bookkeeping to run after the response is sent.
  after(async () => {
    try {
      const reverseOld = async () => {
        if (oldWasTransfer && oldToId) {
          const [fromAcc, toAcc] = await Promise.all([
            getAccountById(oldFromId),
            getAccountById(oldToId),
          ])
          const fromCat = fromAcc.category || 'asset'
          const toCat = toAcc.category || 'asset'
          const fromDelta = calculateBalanceDelta('outgoing', oldAmount, fromCat)
          const toDelta = calculateBalanceDelta('incoming', oldAmount, toCat)
          await Promise.all([
            updateAccountBalance(oldFromId, parseFloat(fromAcc.account_balance) - fromDelta),
            updateAccountBalance(oldToId, parseFloat(toAcc.account_balance) - toDelta),
            reverseTransactionBalance(parseInt(oldFromId.toString(), 10), oldDate, 'outgoing', oldAmount, fromCat),
            reverseTransactionBalance(parseInt(oldToId, 10), oldDate, 'incoming', oldAmount, toCat),
          ])
        } else {
          const type = oldTransaction.transaction_type as 'outgoing' | 'incoming'
          const acc = await getAccountById(oldFromId)
          const cat = acc.category || 'asset'
          const delta = calculateBalanceDelta(type, oldAmount, cat)
          await Promise.all([
            updateAccountBalance(oldFromId, parseFloat(acc.account_balance) - delta),
            reverseTransactionBalance(parseInt(oldFromId.toString(), 10), oldDate, type, oldAmount, cat),
          ])
        }
      }

      const applyNew = async () => {
        if (newIsTransfer && newToId) {
          const [fromAcc, toAcc] = await Promise.all([
            getAccountById(newFromId),
            getAccountById(newToId),
          ])
          const fromCat = fromAcc.category || 'asset'
          const toCat = toAcc.category || 'asset'
          const fromDelta = calculateBalanceDelta('outgoing', newAmount, fromCat)
          const toDelta = calculateBalanceDelta('incoming', newAmount, toCat)
          await Promise.all([
            updateAccountBalance(newFromId, parseFloat(fromAcc.account_balance) + fromDelta),
            updateAccountBalance(newToId, parseFloat(toAcc.account_balance) + toDelta),
            recordTransactionBalance(parseInt(newFromId, 10), newDate, 'outgoing', newAmount, fromCat),
            recordTransactionBalance(parseInt(newToId, 10), newDate, 'incoming', newAmount, toCat),
          ])
        } else {
          const type = effectiveType as 'outgoing' | 'incoming'
          const acc = await getAccountById(newFromId)
          const cat = acc.category || 'asset'
          const delta = calculateBalanceDelta(type, newAmount, cat)
          await Promise.all([
            updateAccountBalance(newFromId, parseFloat(acc.account_balance) + delta),
            recordTransactionBalance(parseInt(newFromId, 10), newDate, type, newAmount, cat),
          ])
        }
      }

      await reverseOld()

      // Reverse old deduction balance effects
      for (const ded of oldDeductions) {
        if (!ded.target_account_id) continue
        const acc = await getAccountById(ded.target_account_id)
        const cat = acc.category || 'asset'
        const delta = calculateBalanceDelta('incoming', ded.amount, cat)
        await Promise.all([
          updateAccountBalance(ded.target_account_id, parseFloat(acc.account_balance) - delta),
          reverseTransactionBalance(ded.target_account_id, oldDate, 'incoming', ded.amount, cat),
        ])
      }

      await applyNew()

      // Apply new deduction balance effects
      for (const ded of newDeductionsForBalance) {
        if (!ded.target_account_id) continue
        const acc = await getAccountById(ded.target_account_id)
        const cat = acc.category || 'asset'
        const bal = parseFloat(acc.account_balance)
        const delta = calculateBalanceDelta('incoming', ded.amount, cat)
        await Promise.all([
          updateAccountBalance(ded.target_account_id, bal + delta),
          recordTransactionBalance(ded.target_account_id, newDate, 'incoming', ded.amount, cat),
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

  // Fetch deductions BEFORE deleting (CASCADE will remove them)
  let deductionsToReverse: { amount: number; target_account_id: number | null }[] = []
  if (transaction.transaction_type === 'incoming') {
    try {
      const deds = await getDeductionsByTransactionId(id)
      deductionsToReverse = deds
        .filter((d) => d.target_account_id)
        .map((d) => ({ amount: d.amount, target_account_id: d.target_account_id ?? null }))
    } catch (e) {
      console.error('Failed to fetch deductions for reversal:', e)
    }
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
  const wasTransfer = deletedTransaction.transaction_type === 'transfer'
  const toId = deletedTransaction.to_account_type_id != null ? deletedTransaction.to_account_type_id.toString() : null
  const txDate = deletedTransaction.date

  after(async () => {
    try {
      if (wasTransfer && toId) {
        const [fromAccount, toAccount] = await Promise.all([
          getAccountById(deletedTransaction.account_type_id),
          getAccountById(toId),
        ])
        const fromCategory = fromAccount.category || 'asset'
        const toCategory = toAccount.category || 'asset'
        const fromDelta = calculateBalanceDelta('outgoing', deletedTransaction.amount, fromCategory)
        const toDelta = calculateBalanceDelta('incoming', deletedTransaction.amount, toCategory)
        await Promise.all([
          updateAccountBalance(deletedTransaction.account_type_id, parseFloat(fromAccount.account_balance) - fromDelta),
          updateAccountBalance(toId, parseFloat(toAccount.account_balance) - toDelta),
          reverseTransactionBalance(
            parseInt(deletedTransaction.account_type_id.toString(), 10),
            deletedTransaction.date,
            'outgoing',
            deletedTransaction.amount,
            fromCategory
          ),
          reverseTransactionBalance(
            parseInt(toId, 10),
            deletedTransaction.date,
            'incoming',
            deletedTransaction.amount,
            toCategory
          ),
        ])
      } else {
        const account = await getAccountById(deletedTransaction.account_type_id)
        const currentBalance = parseFloat(account.account_balance)
        const accountCategory = account.category || 'asset'
        const transactionType = deletedTransaction.transaction_type as 'outgoing' | 'incoming'
        const delta = calculateBalanceDelta(transactionType, deletedTransaction.amount, accountCategory)
        const newBalance = currentBalance - delta
        await Promise.all([
          updateAccountBalance(deletedTransaction.account_type_id, newBalance),
          reverseTransactionBalance(
            parseInt(deletedTransaction.account_type_id.toString(), 10),
            deletedTransaction.date,
            transactionType,
            deletedTransaction.amount,
            accountCategory
          ),
        ])
      }

      // Reverse deduction balance effects
      for (const ded of deductionsToReverse) {
        if (!ded.target_account_id) continue
        const targetAcc = await getAccountById(ded.target_account_id)
        const targetCategory = targetAcc.category || 'asset'
        const targetBalance = parseFloat(targetAcc.account_balance)
        const targetDelta = calculateBalanceDelta('incoming', ded.amount, targetCategory)
        await Promise.all([
          updateAccountBalance(ded.target_account_id, targetBalance - targetDelta),
          reverseTransactionBalance(
            ded.target_account_id,
            txDate,
            'incoming',
            ded.amount,
            targetCategory
          ),
        ])
      }
    } catch (balanceError) {
      console.error('Failed to update account balance:', balanceError)
    }
  })

  return { success: true }
}
