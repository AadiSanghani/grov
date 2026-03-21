import { createAdminSupabaseClient } from '@/ssr/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { warmDefaultFxPairs } from '@/lib/investments/fx'
import { refreshQuoteAndRecentHistory } from '@/lib/investments/market-data'
import type { InvestmentSecurity, InvestmentSyncSlot, SyncRunResult } from '@/lib/investments/types'
import { formatDateForEt, getEtHourMinute } from '@/lib/investments/utils'

interface SecurityRow {
  id: number
  ticker: string
  yahoo_symbol: string
  name: string | null
  asset_type: string
  quote_currency: string
}

type SupabaseClientLike = SupabaseClient

function mapSecurity(row: SecurityRow): InvestmentSecurity {
  return {
    id: String(row.id),
    ticker: row.ticker,
    yahoo_symbol: row.yahoo_symbol,
    name: row.name,
    asset_type: row.asset_type,
    quote_currency: row.quote_currency,
  }
}

export function inferSyncSlotFromEtTime(now: Date = new Date()): InvestmentSyncSlot | null {
  const { hour, minute } = getEtHourMinute(now)
  const minutes = hour * 60 + minute

  const openStart = 9 * 60 + 15
  const openEnd = 10 * 60 + 30
  if (minutes >= openStart && minutes <= openEnd) {
    return 'open'
  }

  const middayStart = 12 * 60
  const middayEnd = 14 * 60
  if (minutes >= middayStart && minutes <= middayEnd) {
    return 'midday'
  }

  const closeStart = 15 * 60 + 30
  const closeEnd = 17 * 60
  if (minutes >= closeStart && minutes <= closeEnd) {
    return 'close'
  }

  return null
}

interface SyncRunStartResult {
  runId: number
  skipped: boolean
  skippedStatus?: string
}

async function ensureBenchmarkSecurity(supabase: SupabaseClientLike): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('investment_securities')
    .select('id')
    .eq('ticker', '^GSPC')
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return

  const { error: insertError } = await supabase
    .from('investment_securities')
    .insert({
      ticker: '^GSPC',
      yahoo_symbol: '^GSPC',
      name: 'S&P 500 Index',
      asset_type: 'index',
      quote_currency: 'USD',
    })

  if (insertError) throw insertError
}

async function startSyncRun(input: {
  supabase: SupabaseClientLike
  runDate: string
  slot: InvestmentSyncSlot
  force?: boolean
}): Promise<SyncRunStartResult> {
  const { supabase, runDate, slot, force } = input

  if (slot === 'manual') {
    const { data, error } = await supabase
      .from('investment_sync_runs')
      .insert({
        run_date: runDate,
        slot,
        status: 'started',
        started_at: new Date().toISOString(),
        finished_at: null,
        symbols_total: 0,
        symbols_succeeded: 0,
        symbols_failed: 0,
        error_summary: null,
        details: null,
      })
      .select('id')
      .single()

    if (error) throw error
    return { runId: data.id, skipped: false }
  }

  const { data: existingRun, error: existingRunError } = await supabase
    .from('investment_sync_runs')
    .select('id, status')
    .eq('run_date', runDate)
    .eq('slot', slot)
    .maybeSingle()

  if (existingRunError) throw existingRunError

  if (existingRun) {
    if (!force && ['started', 'success', 'partial'].includes(existingRun.status)) {
      return {
        runId: existingRun.id,
        skipped: true,
        skippedStatus: existingRun.status,
      }
    }

    const { data, error } = await supabase
      .from('investment_sync_runs')
      .update({
        status: 'started',
        started_at: new Date().toISOString(),
        finished_at: null,
        symbols_total: 0,
        symbols_succeeded: 0,
        symbols_failed: 0,
        error_summary: null,
        details: null,
      })
      .eq('id', existingRun.id)
      .select('id')
      .single()

    if (error) throw error
    return { runId: data.id, skipped: false }
  }

  const { data, error } = await supabase
    .from('investment_sync_runs')
    .insert({
      run_date: runDate,
      slot,
      status: 'started',
      started_at: new Date().toISOString(),
      finished_at: null,
      symbols_total: 0,
      symbols_succeeded: 0,
      symbols_failed: 0,
      error_summary: null,
      details: null,
    })
    .select('id')
    .single()

  if (error) throw error
  return { runId: data.id, skipped: false }
}

export async function runInvestmentMarketSync(input: {
  slot: InvestmentSyncSlot
  force?: boolean
  supabaseClient?: SupabaseClientLike
}): Promise<SyncRunResult> {
  const supabase = input.supabaseClient ?? createAdminSupabaseClient()
  const runDate = formatDateForEt(new Date())
  const slot = input.slot

  await ensureBenchmarkSecurity(supabase)

  const startResult = await startSyncRun({
    supabase,
    runDate,
    slot,
    force: input.force,
  })

  if (startResult.skipped) {
    return {
      run_date: runDate,
      slot,
      status: 'skipped',
      symbols_total: 0,
      symbols_succeeded: 0,
      symbols_failed: 0,
      message: `Sync already ${startResult.skippedStatus} for ${runDate} ${slot}`,
    }
  }

  const runId = startResult.runId

  const { data: securityRows, error: securityRowsError } = await supabase
    .from('investment_securities')
    .select('id, ticker, yahoo_symbol, name, asset_type, quote_currency')

  if (securityRowsError) throw securityRowsError

  const securities = ((securityRows as SecurityRow[] | null) ?? []).map(mapSecurity)

  const failures: Array<{ ticker: string; error: string }> = []
  let successCount = 0

  for (const security of securities) {
    try {
      await refreshQuoteAndRecentHistory(security, {
        supabaseClient: supabase,
      })
      successCount += 1
    } catch (error) {
      failures.push({
        ticker: security.ticker,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    await warmDefaultFxPairs(new Date(), {
      supabaseClient: supabase,
    })
  } catch (error) {
    failures.push({
      ticker: 'FX',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const failedCount = failures.length
  const status = failedCount === 0 ? 'success' : successCount === 0 ? 'failed' : 'partial'

  const { error: finishError } = await supabase
    .from('investment_sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      symbols_total: securities.length,
      symbols_succeeded: successCount,
      symbols_failed: failedCount,
      error_summary: failures.length > 0 ? `${failures.length} symbol updates failed` : null,
      details: failures.length > 0 ? { failures } : { failures: [] },
    })
    .eq('id', runId)

  if (finishError) throw finishError

  return {
    run_date: runDate,
    slot,
    status,
    symbols_total: securities.length,
    symbols_succeeded: successCount,
    symbols_failed: failedCount,
    message:
      status === 'success'
        ? 'Market sync completed successfully'
        : `${failedCount} symbol updates failed`,
  }
}
