"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ArrowRight, X } from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from "recharts"
import { AnalysisPanel } from "@/components/analysis-panel"
import { MetricStrip } from "@/components/metric-strip"
import { ReportStatus } from "@/components/reports/report-status"
import { Button } from "@/components/ui/button"
import { useReportsContext } from "@/app/reports/context"
import { getAccounts } from "@/lib/accounts"
import { getCategories, type Category } from "@/lib/categories"
import { getTransactionsInRange } from "@/lib/transactions"
import type { AccountMap } from "@/components/mermaid-sankey"
import type { Transaction } from "@/lib/types"
import { findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import { isReportIncome, reportCurrency, toReportAccountMap } from "@/lib/report-summary"

const RECENT_LIMIT = 20
const CATEGORY_COLORS = [
  "#22577a",
  "#38a3a5",
  "#57cc99",
  "#80ed99",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
]

function categoryPieLabel(props: PieLabelRenderProps, rows: { label: string; value: string }[], selectedCategory: string | null) {
  const row = rows[props.index]
  if (!row || (props.index >= 5 && row.value !== selectedCategory)) return null

  const angle = -(props.midAngle ?? 0) * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const side = cosine >= 0 ? 1 : -1
  const startX = props.cx + props.outerRadius * cosine
  const startY = props.cy + props.outerRadius * sine
  const bendX = props.cx + (props.outerRadius + 10) * cosine
  const bendY = props.cy + (props.outerRadius + 10) * sine
  const endX = props.cx + side * (props.outerRadius + 18)
  const label = row.label.length > 12 ? `${row.label.slice(0, 11)}…` : row.label

  return (
    <g>
      <path d={`M${startX},${startY} L${bendX},${bendY} L${endX},${bendY}`} fill="none" stroke="var(--muted-foreground)" strokeWidth="1" />
      <text x={endX + side * 4} y={bendY} fill="var(--foreground)" fontSize="11" fontWeight="500" textAnchor={side > 0 ? "start" : "end"} dominantBaseline="central">
        {label}
      </text>
    </g>
  )
}

export function CategoryReport({ kind }: { kind: "spending" | "income" }) {
  const { startDate, endDate } = useReportsContext()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accountsMap, setAccountsMap] = useState<AccountMap>({})
  const [loading, setLoading] = useState(true)
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    const readCategory = () => setSelectedCategory(new URLSearchParams(window.location.search).get("category"))
    readCategory()
    window.addEventListener("popstate", readCategory)
    return () => window.removeEventListener("popstate", readCategory)
  }, [])

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [nextTransactions, nextCategories, accounts] = await Promise.all([
          getTransactionsInRange(startDate, endDate),
          getCategories(),
          kind === "income" ? getAccounts({ includeArchived: true }) : Promise.resolve([]),
        ])
        if (!active) return
        setTransactions(nextTransactions ?? [])
        setCategories((nextCategories ?? []) as Category[])
        setAccountsMap(toReportAccountMap(accounts))
        setLoadedPeriod(`${startDate} to ${endDate}`)
      } catch (fetchError) {
        console.error(`Failed to load ${kind} report:`, fetchError)
        if (active) setError("Unable to load this period. Please try again.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void fetchData()
    return () => { active = false }
  }, [startDate, endDate, kind, retry])

  const report = useMemo(() => {
    const included = transactions.filter((transaction) => kind === "spending"
      ? transaction.transaction_type === "outgoing"
      : isReportIncome(transaction, accountsMap))
    const grouped = new Map<string, { value: string; label: string; amount: number; count: number }>()
    for (const transaction of included) {
      const amount = kind === "spending" ? getSpendingAmount(transaction) : Number(transaction.amount) || 0
      const current = grouped.get(transaction.category) ?? {
        value: transaction.category,
        label: findCategoryByValue(categories, transaction.category)?.label ?? transaction.category,
        amount: 0,
        count: 0,
      }
      current.amount += amount
      current.count += 1
      grouped.set(transaction.category, current)
    }
    const rows = [...grouped.values()]
      .sort((left, right) => right.amount - left.amount)
      .map((row, index) => ({ ...row, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }))
    const total = rows.reduce((sum, row) => sum + row.amount, 0)
    const selected = selectedCategory ? included.filter((transaction) => transaction.category === selectedCategory) : included.slice(0, RECENT_LIMIT)
    return { rows, total, selected }
  }, [transactions, categories, accountsMap, kind, selectedCategory])

  const selectCategory = (value: string | null) => {
    const next = value === selectedCategory ? null : value
    setSelectedCategory(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set("category", next)
    else url.searchParams.delete("category")
    window.history.pushState(null, "", url)
  }

  const isSpending = kind === "spending"
  const title = isSpending ? "Spending" : "Income"
  const top = report.rows[0]
  const selectedLabel = report.rows.find((row) => row.value === selectedCategory)?.label ?? selectedCategory

  if (!loadedPeriod) {
    return <div aria-busy={loading}><ReportStatus loading={loading} error={error} loadedPeriod={loadedPeriod} onRetry={() => setRetry((value) => value + 1)} /></div>
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy={loading}>
      <ReportStatus loading={loading} error={error} loadedPeriod={loadedPeriod} onRetry={() => setRetry((value) => value + 1)} />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title} in this period</h2>
        <p className="mt-1 text-sm text-muted-foreground">Explore categories and the transactions behind them.</p>
      </div>
      <MetricStrip metrics={[
        { label: `Total ${title.toLowerCase()}`, value: reportCurrency.format(report.total) },
        { label: "Categories", value: report.rows.length },
        { label: "Largest category", value: top ? top.label : "—", detail: top ? reportCurrency.format(top.amount) : "No activity in this period" },
      ]} />

      <AnalysisPanel title={`${title} by category`} description="Select a slice or category to see its transactions." action={selectedCategory ? <Button variant="ghost" size="sm" onClick={() => selectCategory(null)}><X aria-hidden="true" className="size-4" /> Clear filter</Button> : null}>
        {report.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No {title.toLowerCase()} in this period.</p> : (
          <div className="grid min-w-0 items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div role="group" aria-label={`${title} distribution pie chart`} className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 36, bottom: 8, left: 36 }}>
                  <Pie
                    data={report.rows}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="37%"
                    outerRadius="55%"
                    paddingAngle={2}
                    labelLine={false}
                    label={(props) => categoryPieLabel(props, report.rows, selectedCategory)}
                    isAnimationActive={false}
                    onClick={(entry: unknown) => {
                      const selected = (entry as { payload?: { value?: string } }).payload?.value
                      if (selected) selectCategory(selected)
                    }}
                  >
                    {report.rows.map((row) => (
                      <Cell
                        key={row.value}
                        fill={row.color}
                        stroke={selectedCategory === row.value ? "var(--foreground)" : "var(--card)"}
                        strokeWidth={selectedCategory === row.value ? 3 : 1}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as (typeof report.rows)[number]
                    return (
                      <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
                        <p className="font-medium">{row.label}</p>
                        <p className="mt-0.5 text-muted-foreground">{reportCurrency.format(row.amount)} · {report.total > 0 ? (row.amount / report.total * 100).toFixed(1) : "0.0"}%</p>
                      </div>
                    )
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="text-sm font-semibold">Category breakdown</h3>
              <p className="mt-1 text-xs text-muted-foreground">Select a row to filter the transactions below.</p>
              <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto">
                {report.rows.map((row) => {
                  const percentage = report.total > 0 ? row.amount / report.total * 100 : 0
                  const active = selectedCategory === row.value
                  return (
                    <button key={row.value} type="button" aria-pressed={active} onClick={() => selectCategory(row.value)} className={`w-full rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "border-primary bg-secondary/60" : "border-transparent hover:border-border hover:bg-muted/40"}`}>
                      <span className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-medium"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="truncate">{row.label}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums">{reportCurrency.format(row.amount)}</span>
                      </span>
                      <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(1, Math.min(100, percentage))}%`, backgroundColor: row.color }} />
                      </span>
                      <span className="mt-1.5 block text-xs text-muted-foreground">{percentage.toFixed(1)}% of {title.toLowerCase()} · {row.count} transaction{row.count === 1 ? "" : "s"}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </AnalysisPanel>

      <AnalysisPanel title={selectedLabel ? `${selectedLabel} transactions` : "Recent transactions"} description={selectedCategory ? "All matching transactions in the selected period." : `Latest ${RECENT_LIMIT} transactions in the selected period.`} action={<Link href="/transactions" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open ledger <ArrowRight aria-hidden="true" className="size-4" /></Link>}>
        {report.selected.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No matching transactions in this period.</p> : (
          <div className="divide-y">
            {report.selected.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{transaction.merchant}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{format(transaction.date, "MMM d, yyyy")} · {findCategoryByValue(categories, transaction.category)?.label ?? transaction.category}</p>
                  {transaction.notes && <p className="mt-1 truncate text-xs text-muted-foreground" title={transaction.notes}>{transaction.notes}</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{isSpending ? "−" : "+"}{reportCurrency.format(isSpending ? getSpendingAmount(transaction) : Number(transaction.amount) || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </AnalysisPanel>
    </div>
  )
}
