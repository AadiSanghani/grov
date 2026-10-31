"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PageLayout } from "@/components/page-layout"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { EditTransactionDialog } from "@/components/edit-transaction-dialog"
import { TransactionList } from "@/components/transaction-list"
import { TransactionToolbar } from "@/components/transaction-filters"
import { TransactionSummary } from "@/components/transaction-summary"
import type { Transaction } from "@/lib/types"
import { getAccounts, type Account } from "@/lib/accounts"
import {
  deleteTransaction,
  duplicateTransaction,
  getTransactions,
} from "@/lib/transactions"
import { getCategories, type Category } from "@/lib/categories"
import { trackEvent } from "@/lib/telemetry"
import { toLocalDateString } from "@/lib/utils"
import { filterTransactions } from "@/lib/ledger/filters"
import { shouldOpenTransaction } from "@/lib/ledger/keyboard"
import { useLedgerFilters } from "@/hooks/use-ledger-filters"

export default function Transactions() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [quickCreateDate, setQuickCreateDate] = useState(() => new Date())
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [density, setDensity] = useState<"compact" | "comfortable">("compact")
  const [filters, setFilters] = useLedgerFilters()
  const referenceDataLoaded = useRef(false)
  const request = useRef(0)
  const pendingActions = useRef(new Set<string>())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())

  const loadData = useCallback(async () => {
    const version = ++request.current
    setLoading(true)
    setError("")
    try {
      const [rows, reference] = await Promise.all([
        getTransactions(),
        referenceDataLoaded.current
          ? Promise.resolve(null)
          : Promise.all([getAccounts(), getCategories()]),
      ])
      if (version !== request.current) return
      setTransactions(rows ?? [])
      if (reference) {
        setAccounts(reference[0] ?? [])
        setCategories(reference[1] ?? [])
        referenceDataLoaded.current = true
      }
      setLoaded(true)
    } catch {
      if (version === request.current)
        setError("We couldn’t load your transactions. Please try again.")
    } finally {
      if (version === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    // Invalidate in-flight responses on unmount, including Strict Mode's cleanup.
    return () => {
      invalidateRequests()
    }
    function invalidateRequests() {
      request.current++
    }
  }, [loadData])
  const tracked = useRef(false)
  useEffect(() => {
    if (loaded && !tracked.current) {
      tracked.current = true
      trackEvent("transactions_view_loaded", {
        totalTransactions: transactions.length,
      })
    }
  }, [loaded, transactions.length])

  const rows = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters]
  )
  const openAdd = useCallback((date?: Date, source = "header") => {
    const nextDate = date ?? new Date()
    setQuickCreateDate(nextDate)
    setIsAddOpen(true)
    trackEvent("transaction_create_opened", {
      source,
      date: toLocalDateString(nextDate),
    })
  }, [])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!isAddOpen && !isEditOpen && shouldOpenTransaction(event)) {
        event.preventDefault()
        openAdd(undefined, "keyboard")
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [openAdd, isAddOpen, isEditOpen])

  const handleCreated = useCallback((data: Transaction) => {
    setTransactions((previous) => [data, ...previous])
  }, [])
  const handleUpdated = useCallback(
    (id: string, data: Partial<Transaction>) => {
      setTransactions((previous) =>
        previous.map((row) => (row.id === id ? { ...row, ...data } : row))
      )
    },
    []
  )
  const handleClick = useCallback((transaction: Transaction) => {
    setSelected(transaction)
    setIsEditOpen(true)
  }, [])
  const mutate = useCallback(
    async (transaction: Transaction, action: "delete" | "duplicate") => {
      if (!transaction.id || pendingActions.current.has(transaction.id)) return
      const id = transaction.id
      pendingActions.current.add(id)
      setPendingIds(new Set(pendingActions.current))
      try {
        if (action === "delete") {
          await deleteTransaction(id)
          setTransactions((previous) => previous.filter((row) => row.id !== id))
        } else {
          await duplicateTransaction(id, toLocalDateString(new Date()))
        }
        toast.success(
          action === "delete" ? "Transaction deleted" : "Transaction duplicated"
        )
        await loadData()
      } catch {
        toast.error(`Could not ${action} transaction. Please try again.`)
      } finally {
        pendingActions.current.delete(id)
        setPendingIds(new Set(pendingActions.current))
      }
    },
    [loadData]
  )
  const handleDelete = useCallback(
    (transaction: Transaction) => {
      void mutate(transaction, "delete")
    },
    [mutate]
  )
  const handleDuplicate = useCallback(
    (transaction: Transaction) => {
      void mutate(transaction, "duplicate")
    },
    [mutate]
  )

  return (
    <PageLayout
      title="Transactions"
      description="Your money, in detail."
      contentClassName="flex flex-col gap-4 pb-8"
      action={
        <Button disabled={!loaded} onClick={() => openAdd()}>
          <Plus className="h-4 w-4" />
          Add transaction
          <kbd className="ml-2 hidden rounded border border-current/20 px-1 text-xs sm:inline">
            N
          </kbd>
        </Button>
      }
    >
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <span>
            {error}
            {loaded ? " Your previous results are still visible." : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadData()}
          >
            Retry
          </Button>
        </div>
      )}
      {!loaded && loading ? (
        <div
          role="status"
          aria-label="Loading transactions"
          className="space-y-4 motion-safe:animate-pulse"
        >
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-24 rounded-lg bg-muted/60" />
          <div className="rounded-xl border p-4">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="my-4 h-12 rounded bg-muted/60" />
            ))}
          </div>
          <span className="sr-only">Loading transactions…</span>
        </div>
      ) : loaded ? (
        <>
          <TransactionToolbar
            filters={filters}
            onFiltersChange={setFilters}
            accountTypes={accounts}
            categories={categories}
          />
          <TransactionSummary transactions={rows} strip />
          <section
            aria-label="Transaction ledger"
            aria-busy={loading}
            className="min-w-0 rounded-xl border bg-background"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">
                  {rows.length.toLocaleString()}
                </span>{" "}
                transactions{loading ? " · Refreshing…" : ""}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="ledger-density" className="sr-only">
                  Row density
                </label>
                <select
                  id="ledger-density"
                  className="rounded-md border bg-background px-2 py-1.5 text-xs"
                  value={density}
                  onChange={(event) =>
                    setDensity(event.target.value as typeof density)
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh transactions"
                  disabled={loading}
                  onClick={() => void loadData()}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
            <div className="p-2 sm:p-3">
              <TransactionList
                transactions={rows}
                pendingIds={pendingIds}
                categories={categories}
                accounts={accounts}
                density={density}
                onTransactionClick={handleClick}
                onDuplicateTransaction={handleDuplicate}
                onDeleteTransaction={handleDelete}
                onCreateForDate={(date) => openAdd(date, "day_group")}
              />
            </div>
          </section>
        </>
      ) : null}
      <AddTransactionDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onTransactionCreated={handleCreated}
        onAfterSave={loadData}
        accounts={accounts}
        categories={categories}
        defaultDate={quickCreateDate}
      />
      <EditTransactionDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        transaction={selected}
        onTransactionUpdated={handleUpdated}
        onAfterSave={loadData}
        accounts={accounts}
        categories={categories}
      />
    </PageLayout>
  )
}
