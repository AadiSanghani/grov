import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { runInvestmentMarketSync } from '@/lib/investments/sync'
import type { InvestmentSyncSlot } from '@/lib/investments/types'
import { createServerSupabaseClient } from '@/ssr/client'

interface RefreshBody {
  slot?: InvestmentSyncSlot
  force?: boolean
}

function isValidSlot(value: unknown): value is InvestmentSyncSlot {
  return value === 'open' || value === 'midday' || value === 'close' || value === 'manual'
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  const secret = process.env.INVESTMENTS_CRON_SECRET ?? process.env.CRON_SECRET
  const secretHeader = request.headers.get('x-investments-refresh-secret')

  if (!userId && (!secret || secretHeader !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RefreshBody = {}
  try {
    body = (await request.json()) as RefreshBody
  } catch {
    body = {}
  }

  const slot = isValidSlot(body.slot) ? body.slot : 'manual'
  const force = body.force ?? true

  try {
    const result = await runInvestmentMarketSync({
      slot,
      force,
      // If request is user-authenticated, use the user-scoped client so RLS policies apply correctly.
      supabaseClient: userId ? createServerSupabaseClient() : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Manual investments refresh failed:', error)
    return NextResponse.json(
      {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
