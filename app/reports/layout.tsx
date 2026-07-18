"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { ReportsProvider, TIMELINE_OPTIONS, useReportsContext } from "./context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function ReportsDateSelect() {
  const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } =
    require("@/components/ui/select")
  const {
    timeline,
    setTimeline,
    customStartDate,
    customEndDate,
    setCustomDateRange,
  } = useReportsContext()

  const [date, setDate] = useState<DateRange | undefined>(() =>
    customStartDate && customEndDate
      ? {
          from: new Date(customStartDate),
          to: new Date(customEndDate),
        }
      : customStartDate
        ? { from: new Date(customStartDate), to: undefined }
        : undefined
  )

  useEffect(() => {
    if (!customStartDate) {
      setDate(undefined)
      return
    }
    setDate({
      from: new Date(customStartDate),
      to: customEndDate ? new Date(customEndDate) : undefined,
    })
  }, [customStartDate, customEndDate])

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
    <div className="flex items-center gap-2">
      <Select value={timeline} onValueChange={setTimeline}>
        <SelectTrigger className="h-9 min-w-[200px] text-sm font-normal">
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
    </div>
  )
}

const ReportsDateSelectClient = dynamic(
  () => Promise.resolve(ReportsDateSelect),
  { ssr: false, loading: () => <div className="w-[180px] h-10 rounded-lg border bg-muted animate-pulse" /> }
)

const TABS = [
  { label: "Cash Flow", href: "/reports/cash-flow" },
  { label: "Spending", href: "/reports/spending" },
  { label: "Income", href: "/reports/income" },
] as const

function ReportsTopBar() {
  const pathname = usePathname()
  return (
    <div className="border-b bg-background">
      <div className="flex items-center justify-between px-6 py-4">
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                pathname === tab.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary-foreground hover:bg-accent"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <ReportsDateSelectClient />
      </div>
      <p className="px-6 pb-3 text-sm text-muted-foreground">
        View cash flow, spending, and income for the selected period.
      </p>
    </div>
  )
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ReportsProvider>
      <div className="flex flex-col min-h-0 flex-1">
        <ReportsTopBar />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </ReportsProvider>
  )
}
