import { NextRequest, NextResponse } from 'next/server'

import { inferSyncSlotFromEtTime, runInvestmentMarketSync } from '@/lib/investments/sync'
import type { InvestmentSyncSlot } from '@/lib/investments/types'

function readBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') return null
  return token ?? null
}

function isValidSlot(value: string | null): value is InvestmentSyncSlot {
  return value === 'open' || value === 'midday' || value === 'close' || value === 'manual'
}

export async function GET(request: NextRequest) {
  const secret = process.env.INVESTMENTS_CRON_SECRET ?? process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'INVESTMENTS_CRON_SECRET (or CRON_SECRET) is not configured' },
      { status: 500 },
    )
  }

  const providedToken =
    readBearerToken(request) ?? request.headers.get('x-cron-secret') ?? request.nextUrl.searchParams.get('secret')

  if (providedToken !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slotParam = request.nextUrl.searchParams.get('slot')
  const inferred = inferSyncSlotFromEtTime(new Date())
  const slot = isValidSlot(slotParam) ? slotParam : inferred

  if (!slot || slot === 'manual') {
    return NextResponse.json({
      status: 'skipped',
      message: 'No active ET sync slot at current time',
    })
  }

  const force = request.nextUrl.searchParams.get('force') === '1'

  try {
    const result = await runInvestmentMarketSync({
      slot,
      force,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Cron investments sync failed:', error)
    return NextResponse.json(
      {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
