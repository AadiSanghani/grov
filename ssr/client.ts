import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

/** Decode JWT payload without verifying (for debugging claims only). */
function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as Record<string, unknown>
    return payload
  } catch {
    return null
  }
}

export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!,
    {
      async accessToken() {
        const token = await (await auth()).getToken()
        if (process.env.NODE_ENV === 'development' && token) {
          const payload = decodeJwtPayload(token)
          console.debug('[Supabase] JWT claims (for debugging):', {
            sub: payload?.sub,
            iss: payload?.iss,
            role: payload?.role,
            exp: payload?.exp,
            hasRole: 'role' in (payload ?? {}),
          })
        }
        return token
      },
    },
  )
}