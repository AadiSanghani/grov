'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'

export interface Category {
  id?: number
  name: string
  emoji: string
  user_id?: string
  group_name: string
}

export interface CategoryItem {
  value: string
  label: string
  emoji: string
}

export interface CategoryGroup {
  group: string
  items: CategoryItem[]
}

const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; emoji: string; group_name: string }> = [
  { name: 'Paychecks', emoji: '💵', group_name: 'Income' },
  { name: 'Business Income', emoji: '💰', group_name: 'Income' },
  { name: 'Other Income', emoji: '💰', group_name: 'Income' },
  { name: 'Side project', emoji: '🛠️', group_name: 'Income' },
  { name: 'Tax refund', emoji: '🧾', group_name: 'Income' },
  { name: 'Expense reimbursement', emoji: '💵', group_name: 'Income' },
  { name: 'Government', emoji: '🏛️', group_name: 'Income' },
  { name: 'Rental', emoji: '🏠', group_name: 'Income' },

  { name: 'Gifts', emoji: '🎁', group_name: 'Gifts & Donations' },
  { name: 'Donation', emoji: '💝', group_name: 'Gifts & Donations' },


  { name: 'Public Transit', emoji: '🚇', group_name: 'Auto & Transport' },
  { name: 'Gas', emoji: '⛽', group_name: 'Auto & Transport' },
  { name: 'Auto Maintenance', emoji: '🔧', group_name: 'Auto & Transport' },
  { name: 'Parking & Tolls', emoji: '🅿️', group_name: 'Auto & Transport' },
  { name: 'Ride Share', emoji: '🚕', group_name: 'Auto & Transport' },
  { name: 'Car payment', emoji: '🚗', group_name: 'Auto & Transport' },

  { name: 'Rent', emoji: '🏠', group_name: 'Housing' },
  { name: 'Mortgage', emoji: '🏠', group_name: 'Housing' },
  { name: 'Home maintenance', emoji: '🔨', group_name: 'Housing' },
  { name: "Parent's Support", emoji: '🏠', group_name: 'Housing' },

  { name: 'Telecom', emoji: '📞', group_name: 'Bills & Utilities' },
  { name: 'Utilities', emoji: '💡', group_name: 'Bills & Utilities' },

  { name: 'Groceries', emoji: '🛒', group_name: 'Food & Dining' },
  { name: 'Restaurants', emoji: '🍽️', group_name: 'Food & Dining' },
  { name: 'Going out', emoji: '🍻', group_name: 'Food & Dining' },
  
  { name: 'Clothing', emoji: '👕', group_name: 'Shopping' },
  { name: 'Electronics', emoji: '💻', group_name: 'Shopping' },
  { name: 'Shopping', emoji: '🛍️', group_name: 'Shopping' },

  // Health & Fitness
  { name: 'Gym', emoji: '💪', group_name: 'Health & Fitness' },
  { name: 'Medical', emoji: '🏥', group_name: 'Healthcare' },
  { name: 'Self-Care', emoji: '🧴', group_name: 'Personal Care' },
  // Other
  { name: 'Insurance', emoji: '🛡️', group_name: 'Insurance' },
  { name: 'Work', emoji: '💼', group_name: 'Work' },
  { name: 'Subscription', emoji: '📋', group_name: 'Subscriptions' },
  { name: 'Travel', emoji: '✈️', group_name: 'Travel' },
  { name: 'Other', emoji: '📦', group_name: 'Other' },
]

async function seedDefaultCategories(userId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const rows = DEFAULT_CATEGORIES.map((c) => ({
    name: c.name,
    emoji: c.emoji,
    group_name: c.group_name,
    user_id: userId,
  }))
  const { error } = await supabase.from('categories').insert(rows)
  if (error) {
    console.error('Error seeding default categories:', error)
    throw error
  }
}

export async function getCategories() {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching categories:', error)
    throw error
  }

  if (!data || data.length === 0) {
    await seedDefaultCategories(userId)
    const { data: seededData, error: fetchAfterSeedError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
    if (fetchAfterSeedError) {
      console.error('Error fetching categories after seed:', fetchAfterSeedError)
      throw fetchAfterSeedError
    }
    return seededData ?? []
  }

  return data
}
