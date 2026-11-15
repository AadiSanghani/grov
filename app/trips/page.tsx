"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import { PageLayout } from "@/components/page-layout"
import { MetricStrip } from "@/components/metric-strip"
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
  if (status === "planned") return "bg-card text-muted-foreground border-border"
  if (status === "completed") return "bg-muted text-foreground border-transparent"
  return "bg-sidebar-accent text-sidebar-accent-foreground border-transparent"
}

export default function TripsPage() {
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [trips, setTrips] = useState<TripWithMetrics[]>([])
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadTrips = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const rows = await getTripsWithMetrics()
      setTrips(rows ?? [])
      setLoaded(true)
    } catch (error) {
      console.error("Failed to load trips:", error)
      setError(true)
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
      description="Every trip, from the first booking to the final expense"
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create trip
        </Button>
      }
    >
      <div aria-busy={loading}>
        <MetricStrip metrics={[
          { label: "Total trips", value: loaded ? trips.length : "—" },
          { label: "Tracked spend", value: loaded ? formatCurrency(totals.totalSpend) : "—" },
          { label: "Linked transactions", value: loaded ? totals.totalTransactions : "—" },
        ]} />
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-card p-5">
          <div>
            <p className="text-sm font-medium">Couldn’t load your trips</p>
            <p className="mt-1 text-sm text-muted-foreground">{loaded ? "Your previous trips are still shown below" : "Try again to load your trips and totals"}</p>
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void loadTrips()}>Try again</Button>
        </div>
      )}

      {loading && <p role="status" className="text-sm text-muted-foreground">{loaded ? "Updating trips…" : "Loading trips…"}</p>}
      {loaded && !loading && !error && trips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-lg font-medium">A place for every travel expense</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Create your first trip, then link expenses to see its total cost and daily spending</p>
            <Button className="mt-6" variant="outline" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Create your first trip</Button>
          </CardContent>
        </Card>
      ) : trips.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`} className="group block min-w-0 rounded-xl">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate text-lg font-medium group-hover:text-primary">{trip.name}</CardTitle>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-1 text-xs font-medium capitalize",
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
                      <p className="text-xs text-muted-foreground">Total spend</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.totalSpend)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Transactions</p>
                      <p className="text-lg font-semibold">{trip.metrics.transactionCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Per day</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.avgPerDay)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Largest expense</p>
                      <p className="text-lg font-semibold">{formatCurrency(trip.metrics.largestExpense)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

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
