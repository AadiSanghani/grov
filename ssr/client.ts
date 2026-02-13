import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!,
    {
      async accessToken() {
        const token = await (await auth()).getToken()
        if (process.env.NODE_ENV === 'development' && token) {
          console.debug('[Supabase] Access token:', token)
        }
        return token
      },
    },
  )
}