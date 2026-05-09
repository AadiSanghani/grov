'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import type { InvestmentAccount } from '@/lib/investments/types'

function requireUserId(userId: string | null): string {
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

export async function getInvestmentAccounts(): Promise<InvestmentAccount[]> {
  const { userId } = await auth()
  const resolvedUserId = requireUserId(userId)
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('account_types')
    .select('id, account_name, account_subtype')
    .eq('user_id', resolvedUserId)
    .eq('account_type', 'Investments')
    .is('archived_at', null)
    .order('account_name', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: String(row.id),
    account_name: row.account_name,
    account_subtype: row.account_subtype ?? '',
    // Reuse existing accounts model. CAD is the current portfolio display base.
    base_currency: 'CAD',
  }))
}

export async function assertInvestmentAccountOwnership(
  accountTypeId: string,
  userId: string,
): Promise<void> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('account_types')
    .select('id')
    .eq('id', Number(accountTypeId))
    .eq('user_id', userId)
    .eq('account_type', 'Investments')
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Investment account not found')
  }
}
