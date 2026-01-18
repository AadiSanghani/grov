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
  
  console.log('Categories from database:', data)
  return data
}
