'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import { auth } from '@clerk/nextjs/server'
import { DailyBalance, NetWorthDataPoint } from './types'
import { getAccountById } from './accounts'
import { calculateBalanceDelta, getCategoryFromAccountType, toLocalDateString } from './utils'

/**
 * Ripple forward: update all balances from a given date forward.
 * This efficiently updates all affected daily balance records with a single query.
 */
export async function rippleForwardBalances(
  accountId: number,
  fromDate: string,  // YYYY-MM-DD
  delta: number
): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }

  // Update all daily balances from the given date forward
  const { error } = await supabase.rpc('ripple_forward_balances', {
    p_account_id: accountId,
    p_from_date: fromDate,
    p_delta: delta,
    p_user_id: userId
  })

  // If RPC doesn't exist, fall back to direct update
  if (error && error.code === 'PGRST202') {
    // Direct update approach
    const { error: updateError } = await supabase
      .from('account_daily_balances')
      .update({ 
        balance_amount: supabase.rpc('add_to_balance', { delta }),
        updated_at: new Date().toISOString()
      })
      .eq('account_id', accountId)
      .gte('date', fromDate)

    // If that also fails, do it manually with a select + update
    if (updateError) {
      // Get all affected records
      const { data: records, error: selectError } = await supabase
        .from('account_daily_balances')
        .select('id, balance_amount')
        .eq('account_id', accountId)
        .gte('date', fromDate)
      
      if (selectError) throw selectError
      
      // Update each record
      for (const record of records || []) {
        await supabase
          .from('account_daily_balances')
          .update({ 
            balance_amount: Number(record.balance_amount) + delta,
            updated_at: new Date().toISOString()
          })
          .eq('id', record.id)
      }
    }
  } else if (error) {
    throw error
  }
}

/**
 * Ensure a daily balance record exists for a given account and date.
 * If it doesn't exist, creates one with the previous day's balance.
 * If no previous balance exists, starts from $0 (account didn't exist yet at that date).
 */
export async function ensureDailyBalance(
  accountId: number,
  date: string,  // YYYY-MM-DD
  userId: string
): Promise<DailyBalance> {
  const supabase = createServerSupabaseClient()
  
  // Check if record already exists
  const { data: existing, error: selectError } = await supabase
    .from('account_daily_balances')
    .select('*')
    .eq('account_id', accountId)
    .eq('date', date)
    .single()
  
  if (existing) {
    return existing as DailyBalance
  }
  
  // Get the most recent balance before this date
  const { data: previousBalance } = await supabase
    .from('account_daily_balances')
    .select('balance_amount')
    .eq('account_id', accountId)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .single()
  
  // Use previous balance if exists, otherwise start from $0
  // Starting from $0 means the account "didn't exist" at this date,
  // so any transactions will create negative balances if outgoing
  let initialBalance = 0
  
  if (previousBalance) {
    initialBalance = Number(previousBalance.balance_amount)
  }
  // If no previous balance, initialBalance stays at 0
  
  // Create the new record
  const { data: newRecord, error: insertError } = await supabase
    .from('account_daily_balances')
    .insert({
      user_id: userId,
      account_id: accountId,
      date,
      balance_amount: initialBalance
    })
    .select()
    .single()
  
  if (insertError) throw insertError
  
  return newRecord as DailyBalance
}

/**
 * Record a transaction's effect on daily balances.
 * Creates/updates the daily balance for the transaction date and ripples forward.
 */
export async function recordTransactionBalance(
  accountId: number,
  transactionDate: string,  // YYYY-MM-DD
  transactionType: 'outgoing' | 'incoming',
  amount: number,
  accountCategory: 'asset' | 'liability'
): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Calculate the delta
  const delta = calculateBalanceDelta(transactionType, amount, accountCategory)
  
  // Ensure a daily balance record exists for this date
  await ensureDailyBalance(accountId, transactionDate, userId)
  
  // Ripple the change forward
  await rippleForwardBalances(accountId, transactionDate, delta)
}

/**
 * Reverse a transaction's effect (for updates/deletes).
 */
export async function reverseTransactionBalance(
  accountId: number,
  transactionDate: string,  // YYYY-MM-DD
  transactionType: 'outgoing' | 'incoming',
  amount: number,
  accountCategory: 'asset' | 'liability'
): Promise<void> {
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Calculate the reverse delta (negate the original delta)
  const delta = -calculateBalanceDelta(transactionType, amount, accountCategory)
  
  // Ripple the reversal forward
  await rippleForwardBalances(accountId, transactionDate, delta)
}

/**
 * Get net worth history for a date range.
 * For each date with data, calculates net worth using the most recent balance
 * for each account on or before that date.
 */
export async function getNetWorthHistory(
  startDate: string,
  endDate: string,
  granularity: 'daily' | 'monthly' = 'daily'
): Promise<NetWorthDataPoint[]> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Fetch accounts to get category mapping
  const { data: accounts, error: accountsError } = await supabase
    .from('account_types')
    .select('id, category')
    .eq('user_id', userId)
  
  if (accountsError) throw accountsError
  
  // Create a map of account_id -> category
  const accountCategoryMap = new Map<number, string>()
  for (const account of accounts || []) {
    accountCategoryMap.set(account.id, account.category)
  }
  
  // Fetch ALL daily balances up to end date (need historical data for carry-forward)
  const { data: balances, error: balancesError } = await supabase
    .from('account_daily_balances')
    .select('date, balance_amount, account_id')
    .eq('user_id', userId)
    .lte('date', endDate)
    .order('date', { ascending: true })
  
  if (balancesError) throw balancesError
  
  if (!balances || balances.length === 0) {
    return []
  }
  
  // Build a map of account_id -> sorted list of {date, balance}
  const accountBalanceHistory = new Map<number, { date: string; balance: number }[]>()
  for (const record of balances) {
    const list = accountBalanceHistory.get(record.account_id) || []
    list.push({ date: record.date, balance: Number(record.balance_amount) })
    accountBalanceHistory.set(record.account_id, list)
  }
  
  // Helper to get the balance for an account on or before a given date
  // Returns 0 if account didn't exist yet (no balance records on or before that date)
  const getBalanceOnDate = (accountId: number, targetDate: string): number => {
    const history = accountBalanceHistory.get(accountId)
    if (!history || history.length === 0) return 0 // Account has no records, treat as 0
    
    // Find the most recent balance on or before targetDate
    let result: number = 0 // Default to 0 if account didn't exist at this date
    for (const entry of history) {
      if (entry.date <= targetDate) {
        result = entry.balance
      } else {
        break // History is sorted, so we can stop
      }
    }
    return result
  }
  
  // Get all unique dates within the requested range that have any data
  const datesWithData = new Set<string>()
  for (const record of balances) {
    if (record.date >= startDate && record.date <= endDate) {
      datesWithData.add(record.date)
    }
  }
  
  if (granularity === 'daily') {
    // For each date with data, calculate net worth using carry-forward balances
    const results: NetWorthDataPoint[] = []
    
    for (const date of Array.from(datesWithData).sort()) {
      let totalAssets = 0
      let totalLiabilities = 0
      
      // For each account, get the balance on or before this date (0 if account didn't exist)
      for (const [accountId, category] of accountCategoryMap) {
        const balance = getBalanceOnDate(accountId, date)
        if (category === 'asset') {
          totalAssets += balance
        } else if (category === 'liability') {
          totalLiabilities += balance
        }
      }
      
      results.push({
        date,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities
      })
    }
    
    return results
  } else {
    // Monthly net worth - get month-end snapshots
    // Group dates by month and use the last date in each month
    const monthLastDate = new Map<string, string>()
    for (const date of datesWithData) {
      const month = date.substring(0, 7)
      const existing = monthLastDate.get(month)
      if (!existing || date > existing) {
        monthLastDate.set(month, date)
      }
    }
    
    const results: NetWorthDataPoint[] = []
    
    for (const [month, lastDate] of monthLastDate) {
      let totalAssets = 0
      let totalLiabilities = 0
      
      // For each account, get the balance on or before this date (0 if account didn't exist)
      for (const [accountId, category] of accountCategoryMap) {
        const balance = getBalanceOnDate(accountId, lastDate)
        if (category === 'asset') {
          totalAssets += balance
        } else if (category === 'liability') {
          totalLiabilities += balance
        }
      }
      
      results.push({
        date: month,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities
      })
    }
    
    return results.sort((a, b) => a.date.localeCompare(b.date))
  }
}

/**
 * Backfill balance history for an account from existing transactions.
 * This should be run once per account during migration.
 */
export async function backfillAccountBalances(accountId: number): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  // Get account info
  const account = await getAccountById(accountId)
  const category = account.category || getCategoryFromAccountType(account.account_type)
  
  // Get all transactions for this account, ordered by date
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('account_type_id', accountId)
    .eq('user_id', userId)
    .order('date', { ascending: true })
  
  if (txError) throw txError
  
  if (!transactions || transactions.length === 0) {
    // No transactions, just create today's balance with current account balance
    const today = toLocalDateString(new Date())
    await ensureDailyBalance(accountId, today, userId)
    return
  }
  
  // Process transactions day by day
  const dailyDeltas = new Map<string, number>()
  
  for (const tx of transactions) {
    const date = tx.date
    const delta = calculateBalanceDelta(
      tx.transaction_type as 'outgoing' | 'incoming',
      tx.amount,
      category
    )
    
    dailyDeltas.set(date, (dailyDeltas.get(date) || 0) + delta)
  }
  
  // Get starting balance (account's initial balance)
  // We need to work backwards from the current balance
  const currentBalance = parseFloat(account.account_balance) || 0
  
  // Calculate total delta from all transactions
  let totalDelta = 0
  for (const delta of dailyDeltas.values()) {
    totalDelta += delta
  }
  
  // Starting balance = current balance - total delta
  const startingBalance = currentBalance - totalDelta
  
  // Generate daily balances
  const dates = Array.from(dailyDeltas.keys()).sort()
  let runningBalance = startingBalance
  
  const balanceRecords: { user_id: string; account_id: number; date: string; balance_amount: number }[] = []
  
  for (const date of dates) {
    runningBalance += dailyDeltas.get(date) || 0
    balanceRecords.push({
      user_id: userId,
      account_id: accountId,
      date,
      balance_amount: runningBalance
    })
  }
  
  // Insert all balance records (upsert to handle existing)
  if (balanceRecords.length > 0) {
    const { error: insertError } = await supabase
      .from('account_daily_balances')
      .upsert(balanceRecords, { onConflict: 'account_id,date' })
    
    if (insertError) throw insertError
  }
}

/**
 * Backfill all accounts for a user.
 */
export async function backfillAllBalances(): Promise<{ success: boolean; accountsProcessed: number; details: string[] }> {
  const supabase = createServerSupabaseClient()
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('User not authenticated')
  }
  
  const details: string[] = []
  
  // Get all accounts for the user with their balances and categories
  const { data: accounts, error } = await supabase
    .from('account_types')
    .select('id, account_name, account_balance, category')
    .eq('user_id', userId)
  
  if (error) throw error
  
  const today = toLocalDateString(new Date())
  let processed = 0
  
  for (const account of accounts || []) {
    try {
      // First, try the normal backfill (processes transactions)
      await backfillAccountBalances(account.id)
      
      // Then, ensure there's at least a record for today with current balance
      // This handles accounts that have no transactions
      const { data: existingToday } = await supabase
        .from('account_daily_balances')
        .select('id')
        .eq('account_id', account.id)
        .eq('date', today)
        .single()
      
      if (!existingToday) {
        // No record for today, create one with current balance
        const { error: insertError } = await supabase
          .from('account_daily_balances')
          .insert({
            user_id: userId,
            account_id: account.id,
            date: today,
            balance_amount: parseFloat(account.account_balance) || 0
          })
        
        if (insertError) {
          details.push(`${account.account_name}: Failed to create today's balance - ${insertError.message}`)
        } else {
          details.push(`${account.account_name}: Created today's balance record (${account.account_balance})`)
        }
      } else {
        details.push(`${account.account_name}: Already has today's balance record`)
      }
      
      processed++
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      details.push(`${account.account_name}: Error - ${errorMsg}`)
      console.error(`Failed to backfill account ${account.id}:`, e)
    }
  }
  
  return { success: true, accountsProcessed: processed, details }
}
