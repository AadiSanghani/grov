'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { type Merchant } from '@/lib/types'

const DEFAULT_MERCHANTS = [
  "Amazon",
  "Walmart",
  "Target",
  "Starbucks",
  "McDonald's",
  "Costco",
  "Apple",
  "Netflix",
  "Spotify",
  "Uber",
  "Google",
  "Chipotle",
  "DoorDash",
  "Uber Eats",
]

export async function getMerchants(): Promise<Merchant[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching merchants:', error)
    throw error
  }

  if (!data || data.length === 0) {
    return await seedDefaultMerchants(userId)
  }

  return data
}

async function seedDefaultMerchants(userId: string): Promise<Merchant[]> {
  const supabase = createServerSupabaseClient()

  const merchantRows = DEFAULT_MERCHANTS.map(name => ({
    user_id: userId,
    name,
  }))

  const { data, error } = await supabase
    .from('merchants')
    .insert(merchantRows)
    .select()

  if (error) {
    console.error('Error seeding default merchants:', error)
    throw error
  }

  return data || []
}

export async function createMerchant(name: string): Promise<Merchant> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Merchant name cannot be empty')
  }

  const { data, error } = await supabase
    .from('merchants')
    .upsert(
      { user_id: userId, name: trimmedName },
      { onConflict: 'user_id,name' }
    )
    .select()
    .single()

  if (error) {
    console.error('Error creating merchant:', error)
    throw error
  }

  return data
}
