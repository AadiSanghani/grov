'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { getCategoryFromAccountType, toLocalDateString } from './utils'

export interface Account {
  id?: number
  account_name: string
  account_type: string
  account_balance: string
  account_subtype: string
  category: 'asset' | 'liability'
  user_id?: string
}

export async function getAccounts() {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const { data, error } = await supabase
    .from('account_types')
    .select('*')
    .eq('user_id', userId)
    
  if (error) throw error
  return data
}

export async function createAccount(data: {
  type: string
  name: string
  subtype: string
  balance: number
}) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Determine category based on account type
  const category = getCategoryFromAccountType(data.type)
  
  // Map the incoming data to match database schema
  const accountData: Omit<Account, 'id'> = {
    account_name: data.name,
    account_type: data.type,
    account_balance: data.balance.toString(),
    account_subtype: data.subtype,
    category,
    user_id: userId,
  }
  
  const { data: result, error } = await supabase
    .from('account_types')
    .insert(accountData)
    .select()
    .single()

  if (error) {
    // Debug: full error and response (remove after fixing)
    console.error('[createAccount] Supabase error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    throw error
  }
  
  // Create initial entry in account_daily_balances for this account
  const today = toLocalDateString(new Date())
  await supabase
    .from('account_daily_balances')
    .upsert({
      user_id: userId,
      account_id: result.id,
      date: today,
      balance_amount: data.balance
    }, { onConflict: 'account_id,date' })
  
  return result
}

export async function updateAccountBalance(accountId: string | number, newBalance: number) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Convert to number if it's a string
  const numericAccountId = typeof accountId === 'string' ? parseInt(accountId, 10) : accountId
  
  console.log('Updating account balance:', { accountId, numericAccountId, newBalance, userId })
  
  const { data, error } = await supabase
    .from('account_types')
    .update({ account_balance: newBalance.toString() })
    .eq('id', numericAccountId)
    .eq('user_id', userId)
    .select()
    .single()
    
  if (error) {
    console.error('Supabase error updating balance:', error)
    throw error
  }
  
  console.log('Balance updated successfully:', data)
  return data
}

export async function getAccountById(accountId: string | number) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Convert to number if it's a string
  const numericAccountId = typeof accountId === 'string' ? parseInt(accountId, 10) : accountId
  
  console.log('Getting account by ID:', { accountId, numericAccountId, userId })
  
  const { data, error } = await supabase
    .from('account_types')
    .select('*')
    .eq('id', numericAccountId)
    .eq('user_id', userId)
    .single()
    
  if (error) {
    console.error('Supabase error getting account:', error)
    throw error
  }
  
  console.log('Account retrieved:', data)
  return data
}