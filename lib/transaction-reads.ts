import type { SupabaseClient } from '@supabase/supabase-js'

/** Fixed dashboard bound; tie breakers keep same-day activity deterministic. */
export function recentTransactionsQuery(supabase: SupabaseClient, userId: string) {
  return supabase.from('transactions').select('*').eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10)
}
