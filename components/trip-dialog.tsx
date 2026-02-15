"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn, normalizeCalendarDate, parseLocalDate, toLocalDateString } from "@/lib/utils"

export interface TripDialogValues {
  name: string
  start_date: string | null
  end_date: string | null
}

interface TripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  initialValues?: TripDialogValues
  onSubmit: (values: TripDialogValues) => Promise<void>
}

export function TripDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialValues,
  onSubmit,
}: TripDialogProps) {
  const [name, setName] = React.useState("")
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined)
  const [startOpen, setStartOpen] = React.useState(false)
  const [endOpen, setEndOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const parseDateValue = React.useCallback((value?: string | null): Date | undefined => {
    if (!value) return undefined
    return normalizeCalendarDate(parseLocalDate(value))
  }, [])

  React.useEffect(() => {
    if (!open) return
    setName(initialValues?.name ?? "")
    setStartDate(parseDateValue(initialValues?.start_date))
    setEndDate(parseDateValue(initialValues?.end_date))
  }, [open, initialValues, parseDateValue])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error("Trip name is required")
      return
    }

    const startDateValue = startDate ? toLocalDateString(startDate) : null
    const endDateValue = endDate ? toLocalDateString(endDate) : null

    if (startDateValue && endDateValue && startDateValue > endDateValue) {
      toast.error("Start date must be before or on end date")
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: trimmedName,
        start_date: startDateValue,
        end_date: endDateValue,
      })
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save trip:", error)
      toast.error("Failed to save trip. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="trip-name">Trip name</Label>
            <Input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Japan Spring 2026"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start date</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MMMM dd, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (!date) return
                      setStartDate(normalizeCalendarDate(date))
                      setStartOpen(false)
                    }}
                    disabled={(date) => (endDate ? normalizeCalendarDate(date) > endDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMMM dd, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    defaultMonth={endDate ?? startDate}
                    onSelect={(date) => {
                      if (!date) return
                      setEndDate(normalizeCalendarDate(date))
                      setEndOpen(false)
                    }}
                    disabled={(date) => (startDate ? normalizeCalendarDate(date) < startDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function toTripDialogValues(input: {
  name: string
  start_date?: Date | null
  end_date?: Date | null
}): TripDialogValues {
  return {
    name: input.name,
    start_date: input.start_date ? toLocalDateString(input.start_date) : null,
    end_date: input.end_date ? toLocalDateString(input.end_date) : null,
  }
}
