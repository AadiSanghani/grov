"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getTripsWithMetrics, createTrip } from "@/lib/trips"
import { type TripWithMetrics } from "@/lib/types"
import { TripDialog } from "@/components/trip-dialog"
import { cn } from "@/lib/utils"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateRange(startDate?: Date | null, endDate?: Date | null): string {
  if (!startDate && !endDate) return "No dates set"
  if (startDate && endDate) {
    return `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`
  }
  if (startDate) return `Starts ${format(startDate, "MMM d, yyyy")}`
  return `Ends ${format(endDate as Date, "MMM d, yyyy")}`
}

function statusBadgeClass(status: TripWithMetrics["status"]) {
  if (status === "planned") return "bg-blue-50 text-blue-700 border-blue-200"
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

export default function TripsPage() {
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [trips, setTrips] = useState<TripWithMetrics[]>([])

  const loadTrips = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getTripsWithMetrics()
      setTrips(rows ?? [])
    } catch (error) {
      console.error("Failed to load trips:", error)
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const totals = useMemo(() => {
    return trips.reduce(
      (acc, trip) => {
        acc.totalSpend += trip.metrics.totalSpend
        acc.totalTransactions += trip.metrics.transactionCount
        return acc
      },
      { totalSpend: 0, totalTransactions: 0 }
    )
  }, [trips])

  return (
    <PageLayout
      title="Trips"
      description="Group related travel spending and track end-to-end trip cost."
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create trip
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total trips</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{trips.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tracked spend</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(totals.totalSpend)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Linked transactions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.totalTransactions}</CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading trips…</p>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No trips yet. Create one and start assigning outgoing transactions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate">{trip.name}</CardTitle>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                        statusBadgeClass(trip.status)
                      )}
                    >
                      {trip.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDateRange(trip.start_date, trip.end_date)}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Total spend</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.totalSpend)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Transactions</p>
                      <p className="text-lg font-semibold">{trip.metrics.transactionCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg/day</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.avgPerDay)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Largest expense</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.largestExpense)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <TripDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create trip"
        submitLabel="Create trip"
        onSubmit={async (values) => {
          await createTrip(values)
          await loadTrips()
        }}
      />
    </PageLayout>
  )
}
