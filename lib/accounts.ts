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