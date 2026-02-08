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

  const handleSelect = (range: DateRange | undefined) => {
    setDate(range)
    if (range?.from && range?.to) {
      const start = range.from.toISOString().slice(0, 10)
      const end = range.to.toISOString().slice(0, 10)
      if (start <= end) setCustomDateRange(start, end)
    }
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
                "h-9 justify-start px-2.5 font-normal text-sm min-w-[200px]",
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
            <Calendar
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleSelect}
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
    <div className="flex items-center justify-between border-b px-6 py-4 bg-background">
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
