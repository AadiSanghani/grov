'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'

export interface Account {
  id?: number
  account_name: string
  account_type: string
  account_balance: string
  account_subtype: string
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
  
  // Map the incoming data to match database schema
  const accountData: Omit<Account, 'id'> = {
    account_name: data.name,
    account_type: data.type,
    account_balance: data.balance.toString(),
    account_subtype: data.subtype,
    user_id: userId,
  }
  
  const { data: result, error } = await supabase
    .from('account_types')
    .insert(accountData)
    .select()
    .single()
    
  if (error) {
    console.error('Supabase error:', error)
    throw error
  }
  
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