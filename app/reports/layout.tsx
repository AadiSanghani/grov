"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { ReportsProvider, TIMELINE_OPTIONS, useReportsContext } from "./context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageLayout } from "@/components/page-layout"
import { SectionTabs } from "@/components/section-tabs"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function ReportsDateSelect() {
  const {
    timeline,
    setTimeline,
    customStartDate,
    customEndDate,
    setCustomDateRange,
    startDate,
    endDate,
  } = useReportsContext()

  const [date, setDate] = useState<DateRange | undefined>(() =>
    customStartDate && customEndDate
      ? {
          from: parseISO(customStartDate),
          to: parseISO(customEndDate),
        }
      : customStartDate
        ? { from: parseISO(customStartDate), to: undefined }
        : undefined
  )

  const applyRange = (range: DateRange) => {
    if (!range.from || !range.to) return

    setDate(range)
    setCustomDateRange(format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd"))
    if (timeline !== "custom") {
      setTimeline("custom")
    }
  }

  const handleDayClick = (day: Date, _modifiers: unknown, event: React.MouseEvent) => {
    // A double click always begins a fresh range. The first click still retains
    // the familiar single-click behaviour of expanding the existing range.
    if (event.detail >= 2) {
      setDate({ from: day, to: undefined })
      return
    }

    if (!date?.from) {
      setDate({ from: day, to: undefined })
      return
    }

    if (!date.to) {
      applyRange(
        day.getTime() < date.from.getTime()
          ? { from: day, to: date.from }
          : { from: date.from, to: day }
      )
      return
    }

    applyRange({
      from: day.getTime() < date.from.getTime() ? day : date.from,
      to: day.getTime() > date.to.getTime() ? day : date.to,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={timeline} onValueChange={setTimeline}>
        <SelectTrigger aria-label="Report period" className="h-9 w-[180px] text-sm font-normal">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          {TIMELINE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {timeline === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              id="date-picker-range"
              className={cn(
                "h-9 justify-start px-2.5 font-normal text-sm min-w-[220px]",
                !date?.from && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="border-b px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
              {date?.from && !date.to
                ? "Now choose the end date."
                : "Click to expand the range. Double-click a day to start a new range."}
            </div>
            <Calendar
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onDayClick={handleDayClick}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
      {timeline !== "custom" && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {format(parseISO(startDate), "MMM d, yyyy")} – {format(parseISO(endDate), "MMM d, yyyy")}
        </span>
      )}
    </div>
  )
}

const ReportsDateSelectClient = dynamic(
  () => Promise.resolve(ReportsDateSelect),
  { ssr: false, loading: () => <div className="w-[180px] h-10 rounded-lg border bg-muted animate-pulse" /> }
)

const TABS = [
  { label: "Overview", href: "/reports" },
  { label: "Cash Flow", href: "/reports/cash-flow" },
  { label: "Spending", href: "/reports/spending" },
  { label: "Income", href: "/reports/income" },
] as const

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ReportsProvider>
      <PageLayout title="Reports" description="Understand what came in, what went out, and what changed." action={<ReportsDateSelectClient />}>
        <SectionTabs tabs={TABS} label="Reports sections" />
        {children}
      </PageLayout>
    </ReportsProvider>
  )
}
