import { Suspense } from "react"
import { format, startOfYear, subMonths } from "date-fns"

import { NetWorthCard } from "@/components/dashboard/net-worth-card"
import { getNetWorthHistory } from "@/lib/balances"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

export type NetWorthRangeKey =
  | "one_month"
  | "three_months"
  | "six_months"
  | "ytd"
  | "all_time"

export interface NetWorthPoint {
  date: string
  label: string
  netWorth: number
}

export interface NetWorthSeriesResult {
  rangeKey: NetWorthRangeKey
  points: NetWorthPoint[]
}

function getDateRange(
  rangeKey: NetWorthRangeKey,
): { startDate: string; endDate: string; granularity: "daily" | "monthly" } {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const endDate = format(tomorrow, "yyyy-MM-dd")

  switch (rangeKey) {
    case "one_month":
      return {
        startDate: format(subMonths(today, 1), "yyyy-MM-dd"),
        endDate,
        granularity: "daily",
      }
    case "three_months":
      return {
        startDate: format(subMonths(today, 3), "yyyy-MM-dd"),
        endDate,
        granularity: "daily",
      }
    case "six_months":
      return {
        startDate: format(subMonths(today, 6), "yyyy-MM-dd"),
        endDate,
        granularity: "monthly",
      }
    case "ytd":
      return {
        startDate: format(startOfYear(today), "yyyy-MM-dd"),
        endDate,
        granularity: "monthly",
      }
    case "all_time":
      return { startDate: "2020-01-01", endDate, granularity: "monthly" }
    default:
      return {
        startDate: format(subMonths(today, 1), "yyyy-MM-dd"),
        endDate,
        granularity: "daily",
      }
  }
}

function getRangeKeyFromSearchParams(
  searchParams?: ResolvedSearchParams,
): NetWorthRangeKey {
  const raw =
    typeof searchParams?.netWorthRange === "string"
      ? searchParams.netWorthRange
      : Array.isArray(searchParams?.netWorthRange)
        ? searchParams.netWorthRange[0]
        : undefined

  if (
    raw === "one_month" ||
    raw === "three_months" ||
    raw === "six_months" ||
    raw === "ytd" ||
    raw === "all_time"
  ) {
    return raw
  }

  return "one_month"
}

async function NetWorthSectionInner({
  searchParams,
}: DashboardNetWorthSectionProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined
  const rangeKey = getRangeKeyFromSearchParams(resolvedSearchParams)
  const { startDate, endDate, granularity } = getDateRange(rangeKey)

  try {
    const rows = await getNetWorthHistory(startDate, endDate, granularity)

    const points: NetWorthPoint[] = rows.map((row) => {
      const dateString = row.date.length === 7 ? `${row.date}-01` : row.date
      return {
        date: row.date,
        label:
          granularity === "monthly"
            ? format(new Date(dateString), "MMM yyyy")
            : format(new Date(dateString), "MMM d"),
        netWorth: row.net_worth,
      }
    })

    const data: NetWorthSeriesResult = { rangeKey, points }

    return <NetWorthCard rangeKey={rangeKey} data={data} />
  } catch (error) {
    console.error("Failed to load net worth data for dashboard:", error)
    return (
      <NetWorthCard
        rangeKey={rangeKey}
        data={{
          rangeKey,
          points: [],
        }}
      />
    )
  }
}

interface DashboardNetWorthSectionProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

export function DashboardNetWorthSection(
  props: DashboardNetWorthSectionProps,
) {
  return (
    <Suspense
      fallback={
        <NetWorthCard
          rangeKey="one_month"
          loading
          data={{
            rangeKey: "one_month",
            points: [],
          }}
        />
      }
    >
      <NetWorthSectionInner {...props} />
    </Suspense>
  )
}
