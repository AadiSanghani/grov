"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TripDialog, toTripDialogValues } from "@/components/trip-dialog"
import { getCategories } from "@/lib/categories"
import {
  deleteTrip,
  getTripById,
  getTripMetrics,
  getTripTransactions,
  getTravelTransactionsForTrip,
  setTripTravelTransactions,
  updateTrip,
} from "@/lib/trips"
import { type Category } from "@/lib/categories"
import { type Transaction, type Trip, type TripMetrics } from "@/lib/types"
import { findCategoryByValue, getSpendingAmount, isReimbursementTransaction } from "@/lib/utils"

type TripTravelCandidate = Awaited<ReturnType<typeof getTravelTransactionsForTrip>>[number]

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

export default function TripDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const tripId = params?.id

  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [associateOpen, setAssociateOpen] = useState(false)
  const [savingAssociations, setSavingAssociations] = useState(false)
  const [associationSearch, setAssociationSearch] = useState("")
  const [travelCandidates, setTravelCandidates] = useState<TripTravelCandidate[]>([])
  const [selectedAssociationIds, setSelectedAssociationIds] = useState<string[]>([])
  const [trip, setTrip] = useState<Trip | null>(null)
  const [metrics, setMetrics] = useState<TripMetrics | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const loadData = useCallback(async () => {
    if (!tripId) return
    setLoading(true)
    try {
      const [tripData, metricsData, transactionData, categoriesData] = await Promise.all([
        getTripById(tripId),
        getTripMetrics(tripId),
        getTripTransactions(tripId),
        getCategories(),
      ])
      setTrip(tripData)
      setMetrics(metricsData)
      setTransactions(transactionData)
      setCategories(categoriesData ?? [])
    } catch (error) {
      console.error("Failed to load trip detail:", error)
      setTrip(null)
      setMetrics(null)
      setTransactions([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const dailyChartData = useMemo(() => {
    if (!metrics) return []
    return metrics.dailySpend.map((point) => ({
      ...point,
      label: format(new Date(`${point.date}T12:00:00`), "MMM d"),
    }))
  }, [metrics])

  const filteredTravelCandidates = useMemo(() => {
    const search = associationSearch.trim().toLowerCase()
    if (!search) return travelCandidates
    return travelCandidates.filter(({ transaction }) => {
      const dateLabel = format(transaction.date, "MMM d, yyyy").toLowerCase()
      return (
        transaction.merchant.toLowerCase().includes(search) ||
        dateLabel.includes(search)
      )
    })
  }, [associationSearch, travelCandidates])

  const loadTravelCandidates = useCallback(async () => {
    if (!tripId) return
    try {
      const rows = await getTravelTransactionsForTrip(tripId)
      setTravelCandidates(rows)
      setSelectedAssociationIds(
        rows
          .filter((row) => row.associated && row.transaction.id)
          .map((row) => row.transaction.id as string)
      )
    } catch (error) {
      console.error("Failed to load travel candidates:", error)
      toast.error("Failed to load travel transactions")
      setTravelCandidates([])
      setSelectedAssociationIds([])
    }
  }, [tripId])

  if (!tripId) {
    return (
      <PageLayout title="Trip" description="Trip not found.">
        <p className="text-sm text-muted-foreground">Missing trip id.</p>
      </PageLayout>
    )
  }

  if (loading) {
    return (
      <PageLayout title="Trip" description="Loading trip details...">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageLayout>
    )
  }

  if (!trip || !metrics) {
    return (
      <PageLayout title="Trip" description="Trip not found.">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This trip does not exist or you no longer have access.
          </p>
          <Button asChild variant="outline">
            <Link href="/trips">
              <ArrowLeft className="h-4 w-4" />
              Back to trips
            </Link>
          </Button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={trip.name}
      description={formatDateRange(trip.start_date, trip.end_date)}
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              setAssociateOpen(true)
              await loadTravelCandidates()
            }}
          >
            Associate transactions
          </Button>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Trip actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setActionsOpen(false)
                  setEditOpen(true)
                }}
              >
                Edit trip
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={async () => {
                  setActionsOpen(false)
                  const confirmed = window.confirm("Delete this trip? Linked transactions will be unassigned.")
                  if (!confirmed) return
                  try {
                    await deleteTrip(tripId)
                    toast.success("Trip deleted")
                    router.push("/trips")
                  } catch (error) {
                    console.error("Failed to delete trip:", error)
                    toast.error("Failed to delete trip")
                  }
                }}
              >
                Delete trip
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      <Button asChild variant="ghost" className="w-fit px-2">
        <Link href="/trips">
          <ArrowLeft className="h-4 w-4" />
          Back to trips
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total spend</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(metrics.totalSpend)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.transactionCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg/day</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(metrics.avgPerDay)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Largest expense</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(metrics.largestExpense)}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Daily spend trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {dailyChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No trip spending yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChartData} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `$${value}`} width={56} />
                  <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data yet.</p>
            ) : (
              metrics.topCategories.map((entry) => {
                const categoryInfo = findCategoryByValue(categories, entry.category)
                return (
                  <div key={entry.category} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {categoryInfo ? `${categoryInfo.emoji} ${categoryInfo.label}` : entry.category}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatCurrency(entry.amount)}</p>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Linked transactions</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/transactions">Open transactions</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No outgoing transactions linked to this trip yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {transactions.map((transaction) => {
                const categoryInfo = findCategoryByValue(categories, transaction.category)
                const spend = getSpendingAmount(transaction)
                const isReimbursement = isReimbursementTransaction(transaction)
                return (
                  <li
                    key={transaction.id}
                  >
                    <Link
                      href="/transactions"
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{transaction.merchant}</p>
                        {isReimbursement && (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Reimbursement
                          </span>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {categoryInfo && (
                            <>
                              <span>{categoryInfo.emoji}</span>
                              <span>{categoryInfo.label}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{format(transaction.date, "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm font-semibold">
                          {formatCurrency(spend)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <TripDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit trip"
        submitLabel="Save changes"
        initialValues={toTripDialogValues({
          name: trip.name,
          start_date: trip.start_date,
          end_date: trip.end_date,
        })}
        onSubmit={async (values) => {
          await updateTrip(tripId, values)
          await loadData()
          toast.success("Trip updated")
        }}
      />

      <Dialog
        open={associateOpen}
        onOpenChange={(nextOpen) => {
          setAssociateOpen(nextOpen)
          if (!nextOpen) {
            setAssociationSearch("")
          }
        }}
      >
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Associate Travel Transactions</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick transactions categorized as Travel to include in this trip.
            </p>

            <Input
              placeholder="Search merchant or date..."
              value={associationSearch}
              onChange={(e) => setAssociationSearch(e.target.value)}
            />

            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-md border p-2">
              {filteredTravelCandidates.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No Travel transactions found.
                </p>
              ) : (
                filteredTravelCandidates.map(({ transaction }) => {
                  const transactionId = transaction.id as string
                  const checked = selectedAssociationIds.includes(transactionId)
                  return (
                    <label
                      key={transactionId}
                      className="grid cursor-pointer grid-cols-[auto_8.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.currentTarget.checked
                          setSelectedAssociationIds((prev) => {
                            if (isChecked) {
                              return prev.includes(transactionId) ? prev : [...prev, transactionId]
                            }
                            return prev.filter((id) => id !== transactionId)
                          })
                        }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {format(transaction.date, "MMM d, yyyy")}
                      </span>
                      <span className="truncate text-sm font-medium">{transaction.merchant}</span>
                      <span className="text-right text-sm font-semibold">
                        {formatCurrency(getSpendingAmount(transaction))}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedAssociationIds.length} selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAssociateOpen(false)}
                  disabled={savingAssociations}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={savingAssociations}
                  onClick={async () => {
                    setSavingAssociations(true)
                    try {
                      await setTripTravelTransactions(tripId, selectedAssociationIds)
                      toast.success("Trip transactions updated")
                      setAssociateOpen(false)
                      await loadData()
                    } catch (error) {
                      console.error("Failed to update trip transactions:", error)
                      toast.error("Failed to update trip transactions")
                    } finally {
                      setSavingAssociations(false)
                    }
                  }}
                >
                  Save associations
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
