import { Suspense } from "react"
import { notFound } from "next/navigation"

import { getSpendingSeries, type SpendingRangeKey } from "@/lib/spending"
import { SpendingCard } from "@/components/dashboard/spending-card"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface DashboardSpendingSectionProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

function getRangeKeyFromSearchParams(
  searchParams?: ResolvedSearchParams,
): SpendingRangeKey {
  const raw =
    typeof searchParams?.spendingRange === "string"
      ? searchParams.spendingRange
      : Array.isArray(searchParams?.spendingRange)
        ? searchParams?.spendingRange[0]
        : undefined

  if (
    raw === "this_month_vs_last_month" ||
    raw === "this_month_vs_last_year" ||
    raw === "this_month_vs_last_3_months"
  ) {
    return raw
  }

  return "this_month_vs_last_month"
}

async function SpendingSectionInner({
  searchParams,
}: DashboardSpendingSectionProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined
  const rangeKey = getRangeKeyFromSearchParams(resolvedSearchParams)

  try {
    const data = await getSpendingSeries(rangeKey)

    return <SpendingCard rangeKey={rangeKey} data={data} />
  } catch (error) {
    console.error("Failed to load spending data for dashboard:", error)
    notFound()
  }
}

export function DashboardSpendingSection(
  props: DashboardSpendingSectionProps,
) {
  return (
    <Suspense
      fallback={
        <SpendingCard
          rangeKey="this_month_vs_last_month"
          loading
          data={{
            rangeKey: "this_month_vs_last_month",
            current: { label: "", total: 0, points: [] },
          }}
        />
      }
    >
      <SpendingSectionInner {...props} />
    </Suspense>
  )
}

