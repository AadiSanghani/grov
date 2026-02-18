import { parseISO, isWithinInterval } from "date-fns"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getInvestmentAccounts } from "@/lib/investments/accounts"
import { getInvestmentTransactions } from "@/lib/investments/transactions"
import type { InvestmentTransactionType } from "@/lib/investments/types"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface TransactionsPageProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

const TYPE_OPTIONS: InvestmentTransactionType[] = ["BUY", "SELL", "DIVIDEND", "FEE"]

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function inRange(dateStr: string, startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return true
  const date = parseISO(dateStr)
  const start = startDate && isDateOnly(startDate) ? parseISO(startDate) : parseISO("1900-01-01")
  const end = endDate && isDateOnly(endDate) ? parseISO(endDate) : parseISO("2999-12-31")
  return isWithinInterval(date, { start, end })
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default async function InvestmentTransactionsPage({ searchParams }: TransactionsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}

  const accountId = firstParam(resolvedSearchParams.accountId).trim()
  const ticker = firstParam(resolvedSearchParams.ticker).trim().toUpperCase()
  const type = firstParam(resolvedSearchParams.type).trim().toUpperCase()
  const startDate = firstParam(resolvedSearchParams.startDate).trim()
  const endDate = firstParam(resolvedSearchParams.endDate).trim()

  const [accounts, transactions] = await Promise.all([
    getInvestmentAccounts(),
    getInvestmentTransactions({
      accountId: accountId || undefined,
    }),
  ])

  const filteredRows = transactions.filter((row) => {
    if (ticker && row.ticker?.toUpperCase() !== ticker) return false
    if (type && row.type !== type) return false
    return inRange(row.trade_date, startDate || undefined, endDate || undefined)
  })

  const summary = filteredRows.reduce(
    (acc, row) => {
      if (row.type === "BUY") acc.buys += 1
      if (row.type === "SELL") acc.sells += 1
      if (row.type === "DIVIDEND") acc.dividends += 1
      if (row.type === "FEE") acc.fees += 1
      return acc
    },
    { buys: 0, sells: 0, dividends: 0, fees: 0 },
  )

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-6" method="get">
            <select
              name="accountId"
              defaultValue={accountId}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <input
              name="ticker"
              defaultValue={ticker}
              placeholder="Ticker (e.g. NVDA)"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <select
              name="type"
              defaultValue={type}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All types</option>
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="startDate"
              defaultValue={isDateOnly(startDate) ? startDate : ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="date"
              name="endDate"
              defaultValue={isDateOnly(endDate) ? endDate : ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{filteredRows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Buys / Sells</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {summary.buys} / {summary.sells}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dividends / Fees</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {summary.dividends} / {summary.fees}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Investment Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 pr-3 font-medium">Price/Amount</th>
                    <th className="py-2 pr-3 font-medium">Fees</th>
                    <th className="py-2 pr-3 font-medium">Currency</th>
                    <th className="py-2 pr-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{row.trade_date}</td>
                      <td className="py-2 pr-3">{row.account_name ?? "-"}</td>
                      <td className="py-2 pr-3 font-medium">{row.ticker ?? "-"}</td>
                      <td className="py-2 pr-3">{row.type}</td>
                      <td className="py-2 pr-3">{row.quantity.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.price, row.currency)}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.fees, row.currency)}</td>
                      <td className="py-2 pr-3">{row.currency}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
