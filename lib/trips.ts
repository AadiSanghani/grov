'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/ssr/client'
import {
  type Transaction,
  type Trip,
  type TripMetrics,
  type TripStatus,
  type TripSummaryMetrics,
  type TripWithMetrics,
} from './types'
import { categoryNameToValue, getSpendingAmount, parseLocalDate, toDateOnlyString } from './utils'

interface TripRow {
  id: number
  user_id: string
  name: string
  start_date: string | null
  end_date: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface TripTransactionLinkRow {
  trip_id: number
  transaction_id: number
}

interface TransactionRow {
  id: number
  user_id?: string
  transaction_type: 'outgoing' | 'incoming' | 'transfer'
  incoming_subtype?: 'income' | 'reimbursement' | null
  amount: number
  merchant: string
  date: string
  account_type_id: number | null
  category: string
  notes?: string | null
  spending_amount?: number | null
  to_account_type_id?: number | null
  created_at?: string | null
  updated_at?: string | null
}

interface TripInput {
  name: string
  start_date?: Date | string | null
  end_date?: Date | string | null
}

interface TripUpdateInput {
  name?: string
  start_date?: Date | string | null
  end_date?: Date | string | null
}

interface TripTravelCandidate {
  transaction: Transaction
  associated: boolean
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

function getStatusFromDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): TripStatus {
  const today = toDateOnlyString(new Date())
  if (startDate && startDate > today) {
    return 'planned'
  }
  if (endDate && endDate < today) {
    return 'completed'
  }
  return 'active'
}

function parseTripRow(row: TripRow): Trip {
  return {
    id: String(row.id),
    user_id: row.user_id,
    name: row.name,
    start_date: row.start_date ? parseLocalDate(row.start_date) : null,
    end_date: row.end_date ? parseLocalDate(row.end_date) : null,
    status: getStatusFromDateRange(row.start_date, row.end_date),
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
  }
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: String(row.id),
    user_id: row.user_id,
    transaction_type: row.transaction_type,
    incoming_subtype: row.incoming_subtype ?? null,
    amount: Number(row.amount) || 0,
    merchant: row.merchant ?? '',
    date: parseLocalDate(row.date),
    account_type_id: row.account_type_id != null ? String(row.account_type_id) : null,
    category: row.category ?? '',
    notes: row.notes ?? undefined,
    spending_amount: row.spending_amount != null ? Number(row.spending_amount) : null,
    to_account_type_id: row.to_account_type_id != null ? String(row.to_account_type_id) : null,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
  }
}

function isTravelCategory(category: string | null | undefined): boolean {
  return categoryNameToValue(category ?? '') === 'travel'
}

function toNumericTripId(tripId: string | number): number {
  const numeric = typeof tripId === 'number' ? tripId : Number(tripId)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error('Invalid trip id')
  }
  return numeric
}

function toDateOnlyOrNull(input?: Date | string | null): string | null {
  if (input == null) return null
  return toDateOnlyString(input)
}

function validateDateRange(startDate: string | null, endDate: string | null): void {
  if (startDate && endDate && startDate > endDate) {
    throw new Error('Trip start date cannot be after end date')
  }
}

function getDayCountFromRange(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0
  const [sYear, sMonth, sDay] = startDate.split('-').map(Number)
  const [eYear, eMonth, eDay] = endDate.split('-').map(Number)
  const startMs = Date.UTC(sYear, sMonth - 1, sDay)
  const endMs = Date.UTC(eYear, eMonth - 1, eDay)
  return Math.max(1, Math.floor((endMs - startMs) / DAY_IN_MS) + 1)
}

function calculateAveragePerDay(
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  transactions: Transaction[],
  totalSpend: number
): number {
  if (totalSpend === 0) return 0

  const startDate = trip.start_date ? toDateOnlyString(trip.start_date) : null
  const endDate = trip.end_date ? toDateOnlyString(trip.end_date) : null

  const rangeDays = getDayCountFromRange(startDate, endDate)
  if (rangeDays > 0) {
    return totalSpend / rangeDays
  }

  const uniqueDays = new Set(
    transactions.map((tx) => toDateOnlyString(tx.date))
  )

  return totalSpend / Math.max(1, uniqueDays.size)
}

function buildSummaryMetrics(
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  transactions: Transaction[]
): TripSummaryMetrics {
  const outgoing = transactions.filter((tx) => tx.transaction_type === 'outgoing')

  let totalSpend = 0
  let largestExpense = 0
  for (const tx of outgoing) {
    const spend = getSpendingAmount(tx)
    totalSpend += spend
    if (spend > largestExpense) largestExpense = spend
  }

  return {
    totalSpend,
    transactionCount: outgoing.length,
    avgPerDay: calculateAveragePerDay(trip, outgoing, totalSpend),
    largestExpense,
  }
}

async function ensureTripOwnership(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tripId: number
): Promise<void> {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('Trip not found')
  }
}

async function getTripLinkRows(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tripId: number
): Promise<TripTransactionLinkRow[]> {
  const { data, error } = await supabase
    .from('trip_transactions')
    .select('trip_id, transaction_id')
    .eq('user_id', userId)
    .eq('trip_id', tripId)

  if (error) throw error
  return (data ?? []) as TripTransactionLinkRow[]
}

async function getTransactionsByIds(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  transactionIds: number[]
): Promise<Transaction[]> {
  if (transactionIds.length === 0) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .in('id', transactionIds)

  if (error) throw error

  const mapped = ((data ?? []) as TransactionRow[]).map(mapTransactionRow)
  mapped.sort((a, b) => b.date.getTime() - a.date.getTime())
  return mapped
}

export async function getTrips(): Promise<Trip[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => parseTripRow(row as TripRow))
}

export async function getTripById(tripId: string | number): Promise<Trip> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', numericTripId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Trip not found')
  return parseTripRow(data as TripRow)
}

export async function createTrip(input: TripInput): Promise<Trip> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const name = input.name.trim()
  if (!name) {
    throw new Error('Trip name is required')
  }

  const startDate = toDateOnlyOrNull(input.start_date)
  const endDate = toDateOnlyOrNull(input.end_date)
  validateDateRange(startDate, endDate)

  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      name,
      start_date: startDate,
      end_date: endDate,
    })
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to create trip')
  return parseTripRow(data as TripRow)
}

export async function updateTrip(
  tripId: string | number,
  input: TripUpdateInput
): Promise<Trip> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)

  const current = await getTripById(numericTripId)
  const nextName = input.name !== undefined ? input.name.trim() : current.name
  if (!nextName) {
    throw new Error('Trip name is required')
  }

  const nextStartDate =
    input.start_date !== undefined
      ? toDateOnlyOrNull(input.start_date)
      : (current.start_date ? toDateOnlyString(current.start_date) : null)
  const nextEndDate =
    input.end_date !== undefined
      ? toDateOnlyOrNull(input.end_date)
      : (current.end_date ? toDateOnlyString(current.end_date) : null)

  validateDateRange(nextStartDate, nextEndDate)

  const { data, error } = await supabase
    .from('trips')
    .update({
      name: nextName,
      start_date: nextStartDate,
      end_date: nextEndDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', numericTripId)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to update trip')
  return parseTripRow(data as TripRow)
}

export async function deleteTrip(tripId: string | number): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', numericTripId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function getTripsWithMetrics(): Promise<TripWithMetrics[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const trips = await getTrips()
  if (trips.length === 0) return []

  const tripIds = trips
    .map((trip) => Number(trip.id))
    .filter((id) => Number.isInteger(id) && id > 0)

  if (tripIds.length === 0) {
    return trips.map((trip) => ({
      ...trip,
      metrics: {
        totalSpend: 0,
        transactionCount: 0,
        avgPerDay: 0,
        largestExpense: 0,
      },
    }))
  }

  const { data: linksData, error: linksError } = await supabase
    .from('trip_transactions')
    .select('trip_id, transaction_id')
    .eq('user_id', userId)
    .in('trip_id', tripIds)

  if (linksError) throw linksError

  const links = (linksData ?? []) as TripTransactionLinkRow[]
  const txIds = Array.from(new Set(links.map((link) => link.transaction_id)))
  const txs = await getTransactionsByIds(supabase, userId, txIds)
  const txMap = new Map<string, Transaction>()
  for (const tx of txs) {
    if (!tx.id) continue
    txMap.set(tx.id, tx)
  }

  const groupedByTrip = new Map<string, Transaction[]>()
  for (const link of links) {
    const tripKey = String(link.trip_id)
    const tx = txMap.get(String(link.transaction_id))
    if (!tx) continue
    const list = groupedByTrip.get(tripKey) ?? []
    list.push(tx)
    groupedByTrip.set(tripKey, list)
  }

  return trips.map((trip) => {
    const rows = groupedByTrip.get(String(trip.id)) ?? []
    return {
      ...trip,
      metrics: buildSummaryMetrics(trip, rows),
    }
  })
}

export async function getTripTransactions(
  tripId: string | number
): Promise<Transaction[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)
  await ensureTripOwnership(supabase, userId, numericTripId)

  const links = await getTripLinkRows(supabase, userId, numericTripId)
  const txIds = links.map((link) => link.transaction_id)
  return getTransactionsByIds(supabase, userId, txIds)
}

export async function getTripMetrics(
  tripId: string | number
): Promise<TripMetrics> {
  const trip = await getTripById(tripId)
  const transactions = await getTripTransactions(tripId)
  const summary = buildSummaryMetrics(trip, transactions)

  const outgoing = transactions.filter((tx) => tx.transaction_type === 'outgoing')

  const categoryTotals = new Map<string, number>()
  const dailyTotals = new Map<string, number>()

  for (const tx of outgoing) {
    const spend = getSpendingAmount(tx)
    const category = tx.category || 'other'
    const isoDate = toDateOnlyString(tx.date)

    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + spend)
    dailyTotals.set(isoDate, (dailyTotals.get(isoDate) ?? 0) + spend)
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const dailySpend = Array.from(dailyTotals.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    ...summary,
    topCategories,
    dailySpend,
  }
}

export async function getTravelTransactionsForTrip(
  tripId: string | number
): Promise<TripTravelCandidate[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)
  await ensureTripOwnership(supabase, userId, numericTripId)

  const [links, outgoingTxs] = await Promise.all([
    getTripLinkRows(supabase, userId, numericTripId),
    (async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_type', 'outgoing')
        .order('date', { ascending: false })

      if (error) throw error
      return ((data ?? []) as TransactionRow[]).map(mapTransactionRow)
    })(),
  ])

  const associatedSet = new Set(links.map((link) => String(link.transaction_id)))

  return outgoingTxs
    .filter((tx) => isTravelCategory(tx.category))
    .map((tx) => ({
      transaction: tx,
      associated: tx.id ? associatedSet.has(tx.id) : false,
    }))
}

export async function setTripTravelTransactions(
  tripId: string | number,
  transactionIds: string[]
): Promise<{ linked: number; unlinked: number }> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  if (!userId) throw new Error('User not authenticated')

  const numericTripId = toNumericTripId(tripId)
  await ensureTripOwnership(supabase, userId, numericTripId)

  const requestedIds = Array.from(
    new Set(
      transactionIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  )

  let allowedIds: number[] = []
  if (requestedIds.length > 0) {
    const { data: eligibleRows, error: eligibleError } = await supabase
      .from('transactions')
      .select('id, category')
      .eq('user_id', userId)
      .eq('transaction_type', 'outgoing')
      .in('id', requestedIds)

    if (eligibleError) throw eligibleError

    allowedIds = (eligibleRows ?? [])
      .filter((row) => isTravelCategory(row.category))
      .map((row) => Number(row.id))
  }

  const currentLinks = await getTripLinkRows(supabase, userId, numericTripId)
  const currentIds = currentLinks.map((link) => link.transaction_id)

  const desiredSet = new Set(allowedIds)
  const currentSet = new Set(currentIds)

  const toAdd = allowedIds.filter((id) => !currentSet.has(id))
  const toRemove = currentIds.filter((id) => !desiredSet.has(id))

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('trip_transactions')
      .upsert(
        toAdd.map((transactionId) => ({
          user_id: userId,
          trip_id: numericTripId,
          transaction_id: transactionId,
        })),
        { onConflict: 'trip_id,transaction_id' }
      )

    if (error) throw error
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('trip_transactions')
      .delete()
      .eq('user_id', userId)
      .eq('trip_id', numericTripId)
      .in('transaction_id', toRemove)

    if (error) throw error
  }

  return {
    linked: toAdd.length,
    unlinked: toRemove.length,
  }
}
