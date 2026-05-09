'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import {
  type TripImportBatch,
  type TripImportDraftTransaction,
  type TripSharedEntry,
  type TripSharedLedgerSummary,
} from './types'
import { createTransaction } from './transactions'
import { EXPENSE_REIMBURSEMENT_CATEGORY, parseLocalDate, toDateOnlyString } from './utils'
import { parseSplitwiseCsv, type SplitwiseParsedRow } from './splitwise'

const MONEY_TOLERANCE = 0.005

interface TripSharedEntryRow {
  id: number
  user_id: string
  trip_id: number
  import_batch_id?: number | null
  transaction_id?: number | null
  source: 'import' | 'manual'
  entry_kind: 'expense' | 'payment'
  payment_direction?: 'received' | 'sent' | null
  date: string
  description: string
  splitwise_category: string
  grov_category: string
  total_cost: number
  currency: string
  self_net: number
  self_share: number
  payer_names: string[] | unknown
  participant_amounts: Record<string, number> | unknown
  raw_row?: Record<string, string> | null
  posting_status: 'posted' | 'ignored' | 'needs_review'
  created_at?: string | null
  updated_at?: string | null
}

interface TripImportBatchRow {
  id: number
  user_id: string
  trip_id: number
  file_name: string
  self_participant: string
  currency: string | null
  status: 'imported' | 'settled' | 'needs_review'
  row_count: number
  expense_count: number
  payment_count: number
  ignored_count: number
  total_cost: number
  total_self_share: number
  total_self_net: number
  created_at?: string | null
  updated_at?: string | null
}

export interface ImportSplitwiseCsvInput {
  tripId: string
  fileName: string
  csvText: string
  selfParticipant: string
  expenseAccountId: string
  paymentAccountId: string
  categoryMap: Record<string, string>
  draftTransactions: TripImportDraftTransaction[]
}

export interface CreateManualSharedExpenseInput {
  tripId: string
  date: Date | string
  description: string
  paidBy: 'me' | 'friend'
  totalCost: number
  myShare: number
  currency: string
  grovCategory: string
  accountId?: string | null
  notes?: string
}

function toNumericTripId(tripId: string | number): number {
  const numeric = typeof tripId === 'number' ? tripId : Number(tripId)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error('Invalid trip id')
  }
  return numeric
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, amount]) => [
      key,
      Number(amount) || 0,
    ])
  )
}

function mapEntry(row: TripSharedEntryRow): TripSharedEntry {
  return {
    id: String(row.id),
    user_id: row.user_id,
    trip_id: String(row.trip_id),
    import_batch_id: row.import_batch_id != null ? String(row.import_batch_id) : null,
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
    source: row.source,
    entry_kind: row.entry_kind,
    payment_direction: row.payment_direction ?? null,
    date: parseLocalDate(row.date),
    description: row.description,
    splitwise_category: row.splitwise_category,
    grov_category: row.grov_category,
    total_cost: Number(row.total_cost) || 0,
    currency: row.currency,
    self_net: Number(row.self_net) || 0,
    self_share: Number(row.self_share) || 0,
    payer_names: asStringArray(row.payer_names),
    participant_amounts: asNumberMap(row.participant_amounts),
    raw_row: row.raw_row ?? null,
    posting_status: row.posting_status,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
  }
}

function mapBatch(row: TripImportBatchRow): TripImportBatch {
  return {
    id: String(row.id),
    user_id: row.user_id,
    trip_id: String(row.trip_id),
    file_name: row.file_name,
    self_participant: row.self_participant,
    currency: row.currency,
    status: row.status,
    row_count: row.row_count,
    expense_count: row.expense_count,
    payment_count: row.payment_count,
    ignored_count: row.ignored_count,
    total_cost: Number(row.total_cost) || 0,
    total_self_share: Number(row.total_self_share) || 0,
    total_self_net: Number(row.total_self_net) || 0,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
  }
}

function isMissingSharedLedgerTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code) : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message) : ''
  return code === 'PGRST205' || message.includes('trip_shared_entries') || message.includes('trip_import_batches')
}

function emptySharedLedger(): {
  entries: TripSharedEntry[]
  batches: TripImportBatch[]
  summary: TripSharedLedgerSummary
} {
  return {
    entries: [],
    batches: [],
    summary: {
      importedRows: 0,
      expenseRows: 0,
      paymentRows: 0,
      ignoredRows: 0,
      myTripSpend: 0,
      paidByMe: 0,
      paidByOthersForMe: 0,
      reimbursements: 0,
      netBalance: 0,
      settled: false,
      currency: null,
    },
  }
}

async function ensureTripOwnership(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tripId: number
) {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Trip not found')
}

async function linkTripTransaction(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tripId: number,
  transactionId: string | number | undefined
) {
  if (transactionId == null) return
  const { error } = await supabase
    .from('trip_transactions')
    .upsert(
      {
        user_id: userId,
        trip_id: tripId,
        transaction_id: Number(transactionId),
      },
      { onConflict: 'trip_id,transaction_id' }
    )
  if (error) throw error
}

async function createLedgerEntry(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tripId: number,
  row: SplitwiseParsedRow,
  importBatchId: number | null,
  postingStatus: 'posted' | 'ignored' | 'needs_review' = row.postingStatus
): Promise<TripSharedEntryRow> {
  const { data, error } = await supabase
    .from('trip_shared_entries')
    .insert({
      user_id: userId,
      trip_id: tripId,
      import_batch_id: importBatchId,
      source: 'import',
      entry_kind: row.entryKind,
      payment_direction: row.paymentDirection,
      date: row.date,
      description: row.description,
      splitwise_category: row.splitwiseCategory,
      grov_category: row.grovCategory,
      total_cost: row.cost,
      currency: row.currency,
      self_net: row.selfNet,
      self_share: row.selfShare,
      payer_names: row.payerNames,
      participant_amounts: row.participantAmounts,
      raw_row: row.rawRow,
      posting_status: postingStatus,
    })
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to create ledger entry')
  return data as TripSharedEntryRow
}

async function postImportedRow(input: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  userId: string
  tripId: number
  entry: TripSharedEntryRow
  draft: TripImportDraftTransaction
}) {
  const { supabase, userId, tripId, entry, draft } = input
  if (!draft.include) return

  const entryId = String(entry.id)
  const notes = draft.notes || 'Trip shared ledger import'
  let transaction: { id?: string | number } | null = null

  if (draft.kind === 'you_paid' || draft.kind === 'friend_paid') {
    const personalShare = draft.spendingAmount ?? draft.amount
    const transactionAmount = draft.kind === 'friend_paid' ? personalShare : draft.amount
    transaction = await createTransaction({
      transaction_type: 'outgoing',
      amount: transactionAmount,
      merchant: draft.merchant,
      date: draft.date,
      account_type_id: draft.affectsBalance ? draft.accountId : null,
      category: draft.category,
      notes,
      spending_amount: personalShare,
      affects_balance: draft.affectsBalance,
      trip_id: String(tripId),
      trip_entry_id: entryId,
      source_type: 'trip_shared_expense',
    })
  } else if (draft.kind === 'payment') {
    if (draft.transactionType === 'outgoing') {
      transaction = await createTransaction({
        transaction_type: 'outgoing',
        amount: draft.amount,
        merchant: draft.merchant,
        date: draft.date,
        account_type_id: draft.accountId,
        category: draft.category || EXPENSE_REIMBURSEMENT_CATEGORY,
        notes,
        spending_amount: 0,
        affects_balance: true,
        trip_id: String(tripId),
        trip_entry_id: entryId,
        source_type: 'trip_settlement',
      })
    } else {
      transaction = await createTransaction({
        transaction_type: 'incoming',
        incoming_subtype: draft.incomingSubtype ?? 'reimbursement',
        amount: draft.amount,
        merchant: draft.merchant,
        date: draft.date,
        account_type_id: draft.accountId,
        category: draft.category || EXPENSE_REIMBURSEMENT_CATEGORY,
        notes,
        affects_balance: true,
        trip_id: String(tripId),
        trip_entry_id: entryId,
        source_type: 'trip_settlement',
      })
    }
  }

  if (!transaction?.id) return

  const { error } = await supabase
    .from('trip_shared_entries')
    .update({
      transaction_id: Number(transaction.id),
      updated_at: new Date().toISOString(),
    })
    .eq('id', entry.id)
    .eq('user_id', userId)
  if (error) throw error

  await linkTripTransaction(supabase, userId, tripId, transaction.id)
}

function validateDraft(draft: TripImportDraftTransaction) {
  if (!draft.include) return
  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    throw new Error(`Draft row ${draft.rowIndex} has an invalid date`)
  }
  if (!draft.merchant.trim()) {
    throw new Error(`Draft row ${draft.rowIndex} is missing a merchant`)
  }
  if (!draft.category.trim()) {
    throw new Error(`Draft row ${draft.rowIndex} is missing a category`)
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    throw new Error(`Draft row ${draft.rowIndex} has an invalid amount`)
  }
  if (
    draft.kind !== 'payment' &&
    (typeof draft.spendingAmount !== 'number' ||
      !Number.isFinite(draft.spendingAmount) ||
      draft.spendingAmount <= 0)
  ) {
    throw new Error(`Draft row ${draft.rowIndex} has an invalid my share amount`)
  }
  if (draft.affectsBalance && !draft.accountId) {
    throw new Error(`Draft row ${draft.rowIndex} is missing an account`)
  }
  if (
    draft.transactionType === 'outgoing' &&
    draft.spendingAmount != null &&
    (draft.spendingAmount < 0 || draft.spendingAmount > draft.amount)
  ) {
    throw new Error(`Draft row ${draft.rowIndex} has an invalid my share amount`)
  }
}

export async function importSplitwiseCsv(input: ImportSplitwiseCsvInput) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const tripId = toNumericTripId(input.tripId)
  await ensureTripOwnership(supabase, userId, tripId)

  const parsed = parseSplitwiseCsv(input.csvText, {
    selfParticipant: input.selfParticipant,
    categoryMap: input.categoryMap,
  })
  const draftByRowIndex = new Map(
    input.draftTransactions.map((draft) => [draft.rowIndex, draft])
  )
  for (const draft of input.draftTransactions) {
    validateDraft(draft)
  }

  const currency = parsed.currencies.length === 1 ? parsed.currencies[0] : null
  const status = parsed.summary.settled ? 'settled' : 'needs_review'

  const { data: batch, error: batchError } = await supabase
    .from('trip_import_batches')
    .insert({
      user_id: userId,
      trip_id: tripId,
      file_name: input.fileName,
      self_participant: input.selfParticipant,
      currency,
      status,
      row_count: parsed.summary.rowCount,
      expense_count: parsed.summary.expenseCount,
      payment_count: parsed.summary.paymentCount,
      ignored_count: parsed.summary.ignoredCount,
      total_cost: parsed.summary.totalCost,
      total_self_share: parsed.summary.totalSelfShare,
      total_self_net: parsed.summary.totalSelfNet,
    })
    .select('*')
    .single()

  if (batchError || !batch) throw batchError ?? new Error('Failed to create import batch')

  let posted = 0
  let ignored = 0
  for (const row of parsed.rows) {
    const draft = draftByRowIndex.get(row.rowIndex)
    const postingStatus =
      row.postingStatus === 'ignored' || !draft?.include ? 'ignored' : 'posted'
    const entry = await createLedgerEntry(
      supabase,
      userId,
      tripId,
      row,
      Number(batch.id),
      postingStatus
    )
    if (postingStatus === 'ignored' || !draft) {
      ignored += 1
      continue
    }
    await postImportedRow({
      supabase,
      userId,
      tripId,
      entry,
      draft,
    })
    posted += 1
  }

  return {
    batch: mapBatch(batch as TripImportBatchRow),
    summary: parsed.summary,
    posted,
    ignored,
  }
}

export async function createManualSharedExpense(input: CreateManualSharedExpenseInput) {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const tripId = toNumericTripId(input.tripId)
  await ensureTripOwnership(supabase, userId, tripId)

  if (input.myShare < 0 || input.totalCost <= 0 || input.myShare > input.totalCost) {
    throw new Error('Amounts are invalid')
  }
  if (input.paidBy === 'me' && !input.accountId) {
    throw new Error('Account is required when you paid')
  }

  const date = toDateOnlyString(input.date)
  const paidByMe = input.paidBy === 'me'
  const selfNet = paidByMe ? input.totalCost - input.myShare : -input.myShare

  const { data: entry, error } = await supabase
    .from('trip_shared_entries')
    .insert({
      user_id: userId,
      trip_id: tripId,
      source: 'manual',
      entry_kind: 'expense',
      date,
      description: input.description.trim(),
      splitwise_category: 'Manual',
      grov_category: input.grovCategory,
      total_cost: input.totalCost,
      currency: input.currency || 'CAD',
      self_net: selfNet,
      self_share: input.myShare,
      payer_names: paidByMe ? ['Me'] : ['Friend'],
      participant_amounts: { Me: selfNet },
      posting_status: input.myShare > MONEY_TOLERANCE ? 'posted' : 'ignored',
    })
    .select('*')
    .single()

  if (error || !entry) throw error ?? new Error('Failed to create shared expense')

  if (input.myShare > MONEY_TOLERANCE) {
    const transaction = await createTransaction({
      transaction_type: 'outgoing',
      amount: paidByMe ? input.totalCost : input.myShare,
      merchant: input.description.trim(),
      date,
      account_type_id: paidByMe ? input.accountId ?? null : null,
      category: input.grovCategory,
      notes: input.notes || 'Manual trip shared expense',
      spending_amount: input.myShare,
      affects_balance: paidByMe,
      trip_id: String(tripId),
      trip_entry_id: String(entry.id),
      source_type: 'trip_shared_expense',
    })

    await supabase
      .from('trip_shared_entries')
      .update({ transaction_id: Number(transaction.id), updated_at: new Date().toISOString() })
      .eq('id', entry.id)
      .eq('user_id', userId)

    await linkTripTransaction(supabase, userId, tripId, transaction.id)
  }

  return mapEntry(entry as TripSharedEntryRow)
}

export async function getTripSharedLedger(tripIdInput: string | number): Promise<{
  entries: TripSharedEntry[]
  batches: TripImportBatch[]
  summary: TripSharedLedgerSummary
}> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const tripId = toNumericTripId(tripIdInput)
  await ensureTripOwnership(supabase, userId, tripId)

  const [entriesResult, batchesResult] = await Promise.all([
    supabase
      .from('trip_shared_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('trip_id', tripId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('trip_import_batches')
      .select('*')
      .eq('user_id', userId)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
  ])

  if (entriesResult.error || batchesResult.error) {
    if (
      isMissingSharedLedgerTableError(entriesResult.error) ||
      isMissingSharedLedgerTableError(batchesResult.error)
    ) {
      return emptySharedLedger()
    }
    throw entriesResult.error ?? batchesResult.error
  }

  const entries = ((entriesResult.data ?? []) as TripSharedEntryRow[]).map(mapEntry)
  const batches = ((batchesResult.data ?? []) as TripImportBatchRow[]).map(mapBatch)
  const expenseEntries = entries.filter((entry) => entry.entry_kind === 'expense')
  const paymentEntries = entries.filter((entry) => entry.entry_kind === 'payment')
  const importedRows = entries.filter((entry) => entry.source === 'import').length
  const myTripSpend = expenseEntries.reduce((sum, entry) => sum + entry.self_share, 0)
  const paidByMe = expenseEntries
    .filter((entry) => entry.self_net > MONEY_TOLERANCE)
    .reduce((sum, entry) => sum + entry.total_cost, 0)
  const paidByOthersForMe = expenseEntries
    .filter((entry) => entry.self_net < -MONEY_TOLERANCE)
    .reduce((sum, entry) => sum + entry.self_share, 0)
  const reimbursements = paymentEntries.reduce((sum, entry) => sum + entry.self_share, 0)
  const netBalance = entries.reduce((sum, entry) => sum + entry.self_net, 0)
  const firstCurrency = entries[0]?.currency ?? batches[0]?.currency ?? null

  return {
    entries,
    batches,
    summary: {
      importedRows,
      expenseRows: expenseEntries.length,
      paymentRows: paymentEntries.length,
      ignoredRows: entries.filter((entry) => entry.posting_status === 'ignored').length,
      myTripSpend,
      paidByMe,
      paidByOthersForMe,
      reimbursements,
      netBalance,
      settled: entries.length > 0 && Math.abs(netBalance) < MONEY_TOLERANCE,
      currency: firstCurrency,
    },
  }
}
