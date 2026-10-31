"use client"

import { useCallback, useRef, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  formatDateForInput,
  parseShortcutDateInput,
} from "@/lib/ledger/date-input"
import { normalizeCalendarDate } from "@/lib/utils"

export function useTransactionDate(initialDate: Date) {
  const [date, setDate] = useState(initialDate)
  const [input, setInput] = useState(() => formatDateForInput(initialDate))
  const draft = useRef(input)
  const [error, setError] = useState("")
  const change = (value: string) => {
    draft.current = value
    setInput(value)
    setError("")
  }
  const apply = useCallback((value: Date) => {
    const normalized = normalizeCalendarDate(value)
    const formatted = formatDateForInput(normalized)
    draft.current = formatted
    setInput(formatted)
    setDate(normalized)
    setError("")
  }, [])
  const commit = () => {
    // Read the draft synchronously: a shortcut can submit before React commits a blur.
    const parsed = parseShortcutDateInput(draft.current, date)
    if (!parsed) {
      setError("Enter a valid date, such as 31/10/2026, today, or -7.")
      return null
    }
    apply(parsed)
    return parsed
  }
  return { date, input, error, change, apply, commit }
}

export function TransactionDateField({
  value,
}: {
  value: ReturnType<typeof useTransactionDate>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor="transaction-date-input">Date</Label>
      <div className="flex gap-2">
        <Input
          id="transaction-date-input"
          value={value.input}
          aria-invalid={!!value.error}
          aria-describedby={
            value.error ? "transaction-date-error" : "transaction-date-help"
          }
          onChange={(event) => value.change(event.target.value)}
          onBlur={() => value.commit()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.repeat) return
            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
              event.preventDefault()
              value.commit()
            }
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setOpen(true)
            }
          }}
          placeholder="DD/MM/YYYY"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Open date picker"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value.date}
              onSelect={(date) => {
                if (date) {
                  value.apply(date)
                  setOpen(false)
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {value.error ? (
        <p
          id="transaction-date-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {value.error}
        </p>
      ) : (
        <p id="transaction-date-help" className="text-xs text-muted-foreground">
          Try t, y, tomorrow, +1, -7, or DD/MM/YYYY.
        </p>
      )}
    </div>
  )
}
