import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { parseISO, isWithinInterval } from "date-fns"
import { computePortfolio } from "@/lib/investments/portfolio"
import { getInvestmentAccounts } from "@/lib/investments/accounts"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface RealizedPageProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

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

function formatCurrency(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default async function RealizedPage({ searchParams }: RealizedPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}

  const accountId = firstParam(resolvedSearchParams.accountId).trim()
  const ticker = firstParam(resolvedSearchParams.ticker).trim().toUpperCase()
  const startDate = firstParam(resolvedSearchParams.startDate).trim()
  const endDate = firstParam(resolvedSearchParams.endDate).trim()

  const [accounts, portfolio] = await Promise.all([
    getInvestmentAccounts(),
    computePortfolio({
      accountId: accountId || undefined,
      ticker: ticker || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  ])

  const filteredRows = portfolio.realizedRows.filter((row) =>
    inRange(row.trade_date, startDate || undefined, endDate || undefined),
  )
  const accountStatus = portfolio.accountStatus
  const totals = filteredRows.reduce(
    (acc, row) => {
      acc.proceeds += row.proceeds_base
      acc.costBasis += row.cost_basis_base
      acc.realized += row.realized_pl_base
      return acc
    },
    { proceeds: 0, costBasis: 0, realized: 0 },
  )

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5" method="get">
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
            <CardTitle className="text-sm text-muted-foreground">Proceeds</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totals.proceeds)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cost Basis</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totals.costBasis)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Realized P/L</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${
              totals.realized >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatCurrency(totals.realized)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
        </CardHeader>
        <CardContent>
          {accountStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No account status yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Market Value</th>
                    <th className="py-2 pr-3 font-medium">Cost Basis</th>
                    <th className="py-2 pr-3 font-medium">Unrealized P/L</th>
                    <th className="py-2 pr-3 font-medium">Realized P/L (All-Time)</th>
                    <th className="py-2 pr-3 font-medium">Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStatus.map((row) => (
                    <tr key={row.account_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.account_name}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.market_value_base, row.base_currency)}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.cost_basis_base, row.base_currency)}</td>
                      <td className={`py-2 pr-3 ${row.unrealized_pl_base >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatCurrency(row.unrealized_pl_base, row.base_currency)}
                      </td>
                      <td className={`py-2 pr-3 ${row.realized_pl_all_time_base >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatCurrency(row.realized_pl_all_time_base, row.base_currency)}
                      </td>
                      <td className={`py-2 pr-3 ${row.total_return_pct >= 0 ? "text-positive" : "text-negative"}`}>
                        {row.total_return_pct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Realized Gains</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No realized rows for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Sale Date</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Qty Sold</th>
                    <th className="py-2 pr-3 font-medium">Proceeds (CAD)</th>
                    <th className="py-2 pr-3 font-medium">Cost Basis (CAD)</th>
                    <th className="py-2 pr-3 font-medium">Realized P/L (CAD)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr key={`${row.trade_date}-${row.account_id}-${row.ticker}-${idx}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">{row.trade_date}</td>
                      <td className="py-2 pr-3">{row.account_name}</td>
                      <td className="py-2 pr-3">{row.ticker}</td>
                      <td className="py-2 pr-3">{row.quantity_sold.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.proceeds_base)}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.cost_basis_base)}</td>
                      <td className={`py-2 pr-3 ${row.realized_pl_base >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatCurrency(row.realized_pl_base)}
                      </td>
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
