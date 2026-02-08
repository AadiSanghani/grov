"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { format, subDays, subMonths, startOfMonth, startOfYear } from "date-fns"

export const TIMELINE_OPTIONS = [
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "month-to-date", label: "Month to Date" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "all-time", label: "All Time" },
  { value: "custom", label: "Custom range" },
] as const

export function getReportsDateRange(timeline: string): { startDate: string; endDate: string } {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const endDate = format(tomorrow, "yyyy-MM-dd")

  switch (timeline) {
    case "last-30-days":
      return { startDate: format(subDays(today, 30), "yyyy-MM-dd"), endDate }
    case "month-to-date":
      return { startDate: format(startOfMonth(today), "yyyy-MM-dd"), endDate }
    case "last-6-months":
      return { startDate: format(subMonths(today, 6), "yyyy-MM-dd"), endDate }
    case "year-to-date":
      return { startDate: format(startOfYear(today), "yyyy-MM-dd"), endDate }
    case "all-time":
      return { startDate: "2020-01-01", endDate }
    case "custom":
      return { startDate: format(subDays(today, 30), "yyyy-MM-dd"), endDate }
    default:
      return { startDate: format(subDays(today, 30), "yyyy-MM-dd"), endDate }
  }
}

export interface ReportsContextValue {
  timeline: string
  setTimeline: (value: string) => void
  startDate: string
  endDate: string
  customStartDate: string
  customEndDate: string
  setCustomDateRange: (startDate: string, endDate: string) => void
}

const ReportsContext = createContext<ReportsContextValue | null>(null)

export function useReportsContext() {
  const ctx = useContext(ReportsContext)
  if (!ctx) {
    throw new Error("useReportsContext must be used within ReportsProvider")
  }
  return ctx
}

const defaultRange = getReportsDateRange("last-30-days")

export function ReportsProvider({
  children,
  initialTimeline = "last-30-days",
}: {
  children: React.ReactNode
  initialTimeline?: string
}) {
  const [timeline, setTimeline] = useState(initialTimeline)
  const [customStartDate, setCustomStartDate] = useState(defaultRange.startDate)
  const [customEndDate, setCustomEndDate] = useState(defaultRange.endDate)

  const setCustomDateRange = useMemo(
    () => (start: string, end: string) => {
      setCustomStartDate(start)
      setCustomEndDate(end)
    },
    []
  )

  const value = useMemo(() => {
    const preset = getReportsDateRange(timeline)
    const startDate = timeline === "custom" ? customStartDate : preset.startDate
    const endDate = timeline === "custom" ? customEndDate : preset.endDate
    return {
      timeline,
      setTimeline,
      startDate,
      endDate,
      customStartDate,
      customEndDate,
      setCustomDateRange,
    }
  }, [timeline, customStartDate, customEndDate, setCustomDateRange])

  return (
    <ReportsContext.Provider value={value}>
      {children}
    </ReportsContext.Provider>
  )
}
