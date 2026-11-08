"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"

import { getSpendingSeries, type SpendingRangeKey, type SpendingSeriesResult } from "@/lib/spending"
import { SpendingCard, SpendingChangesCard } from "@/components/dashboard/spending-card"
import { DashboardReadError } from "./read-error"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface DashboardSpendingSectionProps {
  searchParams?: ResolvedSearchParams
}

const EMPTY_DATA: SpendingSeriesResult = {
  rangeKey: "this_month_vs_last_month",
  categoryChanges: [],
  current: { label: "", total: 0, points: [] },
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

export function DashboardSpendingSection({ searchParams }: DashboardSpendingSectionProps) {
  const rangeKey = getRangeKeyFromSearchParams(searchParams)
  const [localDate, setLocalDate] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    rangeKey: SpendingRangeKey
    localDate: string
    data: SpendingSeriesResult | null
  } | null>(null)

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>

    const updateLocalDate = () => {
      const now = new Date()
      setLocalDate(format(now, "yyyy-MM-dd"))
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      midnightTimer = setTimeout(updateLocalDate, nextMidnight.getTime() - now.getTime() + 100)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(midnightTimer)
        updateLocalDate()
      }
    }

    updateLocalDate()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      clearTimeout(midnightTimer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!localDate) return
    let cancelled = false

    getSpendingSeries(rangeKey, localDate)
      .then((data) => {
        if (!cancelled) setResult({ rangeKey, localDate, data })
      })
      .catch((error) => {
        console.error("Failed to load spending data for dashboard:", error)
        if (!cancelled) setResult({ rangeKey, localDate, data: null })
      })

    return () => {
      cancelled = true
    }
  }, [rangeKey, localDate, retry])

  const currentResult = result?.rangeKey === rangeKey && result.localDate === localDate
    ? result
    : null

  if (currentResult && !currentResult.data) {
    const onRetry = () => {
      setResult(null)
      setRetry((value) => value + 1)
    }
    return (
      <>
        <DashboardReadError title="What changed?" onRetry={onRetry} />
        <div className="min-w-0 lg:col-span-2">
          <DashboardReadError title="Spending pace" onRetry={onRetry} />
        </div>
      </>
    )
  }

  return (
    <>
      <SpendingChangesCard data={currentResult?.data ?? EMPTY_DATA} loading={!currentResult} />
      <div className="min-w-0 lg:col-span-2">
        <SpendingCard
          rangeKey={rangeKey}
          data={currentResult?.data ?? EMPTY_DATA}
          loading={!currentResult}
        />
      </div>
    </>
  )
}
