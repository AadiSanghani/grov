import type { NetWorthDataPoint } from './types'

export interface BalanceHistoryRow {
  account_id: number
  date: string
  balance_amount: number | string
}

/**
 * Sweep chronologically ordered rows once, including pre-period opening balances.
 * Keep only the latest balance per account and the requested chart snapshots.
 * A day may span pages; emit it only after every balance on that day was applied.
 * Like the original chart, emit dates with records, not synthetic gap dates.
 */
export function createNetWorthSweep(
  accounts: ReadonlyArray<{ id: number; category: string }>,
  startDate: string,
  endDate: string,
  granularity: 'daily' | 'monthly',
) {
  const categories = new Map(accounts.map((account) => [account.id, account.category]))
  const latest = new Map<number, number>()
  const results: NetWorthDataPoint[] = []
  let assets = 0
  let liabilities = 0
  let currentDate: string | null = null

  function emit() {
    if (!currentDate || currentDate < startDate || currentDate > endDate) return
    const date = granularity === 'monthly' ? currentDate.slice(0, 7) : currentDate
    const point = {
      date,
      total_assets: assets / 100,
      total_liabilities: liabilities / 100,
      net_worth: (assets - liabilities) / 100,
    }
    if (results.at(-1)?.date === date) results[results.length - 1] = point
    else results.push(point)
  }

  return {
    push(rows: ReadonlyArray<BalanceHistoryRow>) {
      for (const row of rows) {
        if (currentDate && row.date < currentDate) throw new Error('Balance history must be ordered by date')
        if (row.date !== currentDate) {
          emit()
          currentDate = row.date
        }
        const balance = Number(row.balance_amount)
        if (!Number.isFinite(balance)) throw new Error('Invalid historical balance')
        // The persisted NUMERIC(15, 2) amounts are cents. Integer accumulation
        // avoids a long sweep introducing floating-point drift into zero totals.
        const cents = Math.round(balance * 100)
        const delta = cents - (latest.get(row.account_id) ?? 0)
        latest.set(row.account_id, cents)
        const category = categories.get(row.account_id)
        if (category === 'asset') assets += delta
        else if (category === 'liability') liabilities += delta
      }
    },
    finish(): NetWorthDataPoint[] {
      emit()
      return results
    },
  }
}
