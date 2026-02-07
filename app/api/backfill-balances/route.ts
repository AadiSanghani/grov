// TODO: Remove this route after testing
import { NextResponse } from 'next/server'
import { backfillAllBalances } from '@/lib/balances'

export async function POST() {
  try {
    const result = await backfillAllBalances()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json(
      { error: 'Failed to backfill balances' },
      { status: 500 }
    )
  }
}
