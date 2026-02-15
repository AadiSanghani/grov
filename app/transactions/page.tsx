"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { CalendarDays, ChevronDown, ChevronUp, Plus, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageLayout } from "@/components/page-layout"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { EditTransactionDialog } from "@/components/edit-transaction-dialog"
import { TransactionList } from "@/components/transaction-list"
import { TransactionFiltersPanel } from "@/components/transaction-filters"
import { TransactionSummary } from "@/components/transaction-summary"
import { Transaction, TransactionFilters } from "@/lib/types"
import { getAccounts, type Account } from "@/lib/accounts"
import { deleteTransaction, duplicateTransaction, getTransactions } from "@/lib/transactions"
import { getCategories, type Category } from "@/lib/categories"
import { type TransactionFormData } from "@/components/add-transaction-dialog"
import { trackEvent } from "@/lib/telemetry"
import { toLocalDateString } from "@/lib/utils"

const REDESIGN_ENABLED = process.env.NEXT_PUBLIC_TRANSACTIONS_REDESIGN !== "0"

export default function Transactions() {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false)
  const [isEditTransactionOpen, setIsEditTransactionOpen] = useState(false)
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [quickCreateDate, setQuickCreateDate] = useState<Date>(() => new Date())
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<TransactionFilters>({
    sortBy: "date",
    sortOrder: "desc",
    search: "",
    account_types: [],
    categories: [],
    tags: [],
  })

  const hasTrackedViewRef = useRef(false)

  useEffect(() => {
    if (!loading && !hasTrackedViewRef.current) {
      hasTrackedViewRef.current = true
      trackEvent("transactions_view_loaded", {
        totalTransactions: transactions.length,
      })
    }
  }, [loading, transactions.length])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      const [transactionsData, accountsData, categoriesData] = await Promise.all([
        getTransactions(),
        getAccounts(),
        getCategories(),
      ])

      setTransactions(transactionsData || [])
      setAccounts(accountsData || [])
      setCategories(categoriesData || [])
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const refreshData = useCallback(async () => {
    try {
      const [transactionsData, accountsData, categoriesData] = await Promise.all([
        getTransactions(),
        getAccounts(),
        getCategories(),
      ])

      setTransactions(transactionsData || [])
      setAccounts(accountsData || [])
      setCategories(categoriesData || [])
    } catch (error) {
      console.error("Failed to refresh data:", error)
    }
  }, [])

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions]

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.merchant.toLowerCase().includes(searchLower) ||
          t.category.toLowerCase().includes(searchLower) ||
          t.notes?.toLowerCase().includes(searchLower)
      )
    }

    if (filters.account_types.length > 0) {
      const hasUnassigned = filters.account_types.includes("__unassigned__")
      filtered = filtered.filter((t) =>
        hasUnassigned
          ? t.account_type_id == null
          : t.account_type_id != null && filters.account_types.includes(t.account_type_id)
      )
    }

    if (filters.categories.length > 0) {
      filtered = filtered.filter((t) => filters.categories.includes(t.category))
    }

    if (filters.amountMin !== undefined) {
      filtered = filtered.filter((t) => t.amount >= filters.amountMin!)
    }
    if (filters.amountMax !== undefined) {
      filtered = filtered.filter((t) => t.amount <= filters.amountMax!)
    }

    if (filters.dateStart) {
      const start = toLocalDateString(filters.dateStart)
      filtered = filtered.filter((t) => toLocalDateString(t.date) >= start)
    }
    if (filters.dateEnd) {
      const end = toLocalDateString(filters.dateEnd)
      filtered = filtered.filter((t) => toLocalDateString(t.date) <= end)
    }

    filtered.sort((a, b) => {
      let comparison = 0

      switch (filters.sortBy) {
        case "date":
          comparison = b.date.getTime() - a.date.getTime()
          break
        case "amount":
          comparison = b.amount - a.amount
          break
        case "merchant":
          comparison = a.merchant.localeCompare(b.merchant)
          break
      }

      if (comparison !== 0) {
        return filters.sortOrder === "asc" ? -comparison : comparison
      }

      const aTime = a.created_at?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bTime = b.created_at?.getTime() ?? Number.MAX_SAFE_INTEGER
      return bTime - aTime
    })

    return filtered
  }, [transactions, filters])

  const openAddTransaction = useCallback(
    (date?: Date, source: "header" | "floating" | "day_group" = "header") => {
      const selectedDate = date ?? new Date()
      setQuickCreateDate(selectedDate)
      setIsAddTransactionOpen(true)
      trackEvent("transaction_create_opened", {
        source,
        date: toLocalDateString(selectedDate),
      })
    },
    []
  )

  const handleTransactionClick = useCallback((transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsEditTransactionOpen(true)
    trackEvent("transaction_row_opened", {
      transactionType: transaction.transaction_type,
      hasNotes: Boolean(transaction.notes?.trim()),
      date: toLocalDateString(transaction.date),
    })
  }, [])

  const handleFiltersChange = useCallback((nextFilters: TransactionFilters) => {
    setFilters(nextFilters)
    trackEvent("filters_changed", {
      sortBy: nextFilters.sortBy,
      searchActive: Boolean(nextFilters.search.trim()),
      dateRangeActive: Boolean(nextFilters.dateStart || nextFilters.dateEnd),
      accountFilters: nextFilters.account_types.length,
      categoryFilters: nextFilters.categories.length,
    })
  }, [])

  const handleOptimisticCreate = useCallback((data: TransactionFormData) => {
    const optimisticTx: Transaction = {
      id: `temp-${Date.now()}`,
      transaction_type: data.transaction_type,
      incoming_subtype: data.incoming_subtype ?? null,
      amount: data.amount,
      merchant: data.merchant,
      date: data.date,
      account_type_id: data.account_type_id,
      category: data.category,
      notes: data.notes || "",
    }
    setTransactions((prev) => [optimisticTx, ...prev])
    trackEvent("transaction_create_submitted", {
      transactionType: data.transaction_type,
      hasNotes: Boolean(data.notes?.trim()),
      date: toLocalDateString(data.date),
    })
  }, [])

  const handleOptimisticUpdate = useCallback((id: string, data: Partial<Transaction>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)))
  }, [])

  const handleOptimisticDelete = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleDuplicateTransaction = useCallback(async (transaction: Transaction) => {
    if (!transaction.id) return

    try {
      await duplicateTransaction(transaction.id, toLocalDateString(new Date()))
      await refreshData()
    } catch (error) {
      console.error("Failed to duplicate transaction:", error)
      toast.error("Failed to duplicate transaction. Please try again.")
    }
  }, [refreshData])

  const handleDeleteTransaction = useCallback(async (transaction: Transaction) => {
    if (!transaction.id) return

    const confirmed = window.confirm("Delete this transaction? This action cannot be undone.")
    if (!confirmed) return

    const transactionId = transaction.id
    handleOptimisticDelete(transactionId)

    try {
      await deleteTransaction(transactionId)
    } catch (error) {
      console.error("Failed to delete transaction:", error)
      toast.error("Failed to delete transaction. Please try again.")
    } finally {
      await refreshData()
    }
  }, [handleOptimisticDelete, refreshData])

  if (loading) {
    return (
      <PageLayout
        title="Transactions"
        description="View, filter, and manage all your transactions."
      >
        <p className="text-muted-foreground">Loading transactions...</p>
      </PageLayout>
    )
  }

  const pageAction = (
    <Button onClick={() => openAddTransaction(undefined, "header")}>
      <Plus className="w-4 h-4" />
      Add transaction
    </Button>
  )

  if (!REDESIGN_ENABLED) {
    return (
      <PageLayout
        title="Transactions"
        description="View, filter, and manage all your transactions."
        action={pageAction}
        contentClassName="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-4">
            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold">Transactions</h2>
              </div>
              <div className="p-6">
                <TransactionList
                  transactions={filteredTransactions}
                  categories={categories}
                  accounts={accounts}
                  onTransactionClick={handleTransactionClick}
                  onDuplicateTransaction={handleDuplicateTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
              <div className="overflow-hidden rounded-xl border bg-background">
                <div className="shrink-0 border-b px-4 py-3">
                  <h2 className="text-lg font-semibold">Filter & sort</h2>
                </div>
                <TransactionFiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  accountTypes={accounts}
                  categories={categories}
                />
              </div>

              <div className="overflow-hidden rounded-xl border bg-background">
                <div className="shrink-0 border-b px-4 py-3">
                  <h2 className="text-lg font-semibold">Summary</h2>
                </div>
                <TransactionSummary transactions={filteredTransactions} />
              </div>
            </div>
          </div>
        </div>

        <AddTransactionDialog
          open={isAddTransactionOpen}
          onOpenChange={setIsAddTransactionOpen}
          onTransactionCreated={handleOptimisticCreate}
          onAfterSave={refreshData}
          accounts={accounts}
          categories={categories}
          defaultDate={quickCreateDate}
        />

        <EditTransactionDialog
          open={isEditTransactionOpen}
          onOpenChange={setIsEditTransactionOpen}
          transaction={selectedTransaction}
          onTransactionUpdated={handleOptimisticUpdate}
          onAfterSave={refreshData}
          accounts={accounts}
          categories={categories}
        />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Transactions"
      description="View, filter, and manage all your transactions."
      action={pageAction}
      contentClassName="flex flex-col gap-4 pb-20"
    >
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex-1">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filter & sort
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[92vw] p-0 sm:max-w-sm">
            <SheetHeader className="border-b">
              <SheetTitle>Filter & sort</SheetTitle>
            </SheetHeader>
            <TransactionFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              accountTypes={accounts}
              categories={categories}
            />
          </SheetContent>
        </Sheet>

        <Button
          type="button"
          variant="outline"
          onClick={() => setIsMobileSummaryOpen((prev) => !prev)}
          className="flex-1"
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Summary
          {isMobileSummaryOpen ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
              <h2 className="text-lg font-semibold">Transactions</h2>
              <span className="text-xs text-muted-foreground">
                {filteredTransactions.length.toLocaleString("en-US")} shown
              </span>
            </div>
            <div className="p-3 sm:p-4">
              <TransactionList
                transactions={filteredTransactions}
                categories={categories}
                accounts={accounts}
                density="balanced"
                amountColorMode="semantic-minimal"
                showNotesPreview
                onTransactionClick={handleTransactionClick}
                onDuplicateTransaction={handleDuplicateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onCreateForDate={(date) => openAddTransaction(date, "day_group")}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-background lg:hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between border-b px-4 py-3 text-left"
              onClick={() => setIsMobileSummaryOpen((prev) => !prev)}
              aria-expanded={isMobileSummaryOpen}
            >
              <h2 className="text-base font-semibold">Summary</h2>
              {isMobileSummaryOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {isMobileSummaryOpen && (
              <TransactionSummary
                transactions={filteredTransactions}
                collapsedSecondaryByDefault
              />
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b px-4 py-3">
                <h2 className="text-base font-semibold">Filter & sort</h2>
              </div>
              <TransactionFiltersPanel
                filters={filters}
                onFiltersChange={handleFiltersChange}
                accountTypes={accounts}
                categories={categories}
              />
            </div>

            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b px-4 py-3">
                <h2 className="text-base font-semibold">Summary</h2>
              </div>
              <TransactionSummary
                transactions={filteredTransactions}
                collapsedSecondaryByDefault
              />
            </div>
          </div>
        </aside>
      </div>

      <AddTransactionDialog
        open={isAddTransactionOpen}
        onOpenChange={setIsAddTransactionOpen}
        onTransactionCreated={handleOptimisticCreate}
        onAfterSave={refreshData}
        accounts={accounts}
        categories={categories}
        defaultDate={quickCreateDate}
      />

      <EditTransactionDialog
        open={isEditTransactionOpen}
        onOpenChange={setIsEditTransactionOpen}
        transaction={selectedTransaction}
        onTransactionUpdated={handleOptimisticUpdate}
        onAfterSave={refreshData}
        accounts={accounts}
        categories={categories}
      />
    </PageLayout>
  )
}
