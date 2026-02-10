"use client"

import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo, useCallback } from "react"
import { Plus } from "lucide-react"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { EditTransactionDialog } from "@/components/edit-transaction-dialog"
import { TransactionList } from "@/components/transaction-list"
import { TransactionFiltersPanel } from "@/components/transaction-filters"
import { TransactionSummary } from "@/components/transaction-summary"
import { Transaction, TransactionFilters } from "@/lib/types"
import { getAccounts, type Account } from "@/lib/accounts"
import { getTransactions } from "@/lib/transactions"
import { getCategories, type Category } from "@/lib/categories"
import { type TransactionFormData } from "@/components/add-transaction-dialog"

export default function Transactions() {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false)
  const [isEditTransactionOpen, setIsEditTransactionOpen] = useState(false)
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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      const [transactionsData, accountsData, categoriesData] = await Promise.all([
        getTransactions(),
        getAccounts(),
        getCategories()
      ])
      
      setTransactions(transactionsData || [])
      setAccounts(accountsData || [])
      setCategories(categoriesData || [])
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  const refreshData = async () => {
    try {
      const [transactionsData, accountsData, categoriesData] = await Promise.all([
        getTransactions(),
        getAccounts(),
        getCategories()
      ])
      
      setTransactions(transactionsData || [])
      setAccounts(accountsData || [])
      setCategories(categoriesData || [])
    } catch (error) {
      console.error("Failed to refresh data:", error)
    }
  }

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(t => 
        t.merchant.toLowerCase().includes(searchLower) ||
        t.category.toLowerCase().includes(searchLower) ||
        t.notes?.toLowerCase().includes(searchLower)
      )
    }

    // Account filter
    if (filters.account_types.length > 0) {
      filtered = filtered.filter(t => filters.account_types.includes(t.account_type_id))
    }

    // Category filter
    if (filters.categories.length > 0) {
      filtered = filtered.filter(t => filters.categories.includes(t.category))
    }

    // Amount filter
    if (filters.amountMin !== undefined) {
      filtered = filtered.filter(t => t.amount >= filters.amountMin!)
    }
    if (filters.amountMax !== undefined) {
      filtered = filtered.filter(t => t.amount <= filters.amountMax!)
    }

    // Date range filter
    if (filters.dateStart) {
      filtered = filtered.filter(t => t.date >= filters.dateStart!)
    }
    if (filters.dateEnd) {
      filtered = filtered.filter(t => t.date <= filters.dateEnd!)
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

  const handleTransactionClick = useCallback((transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsEditTransactionOpen(true)
  }, [])

  const handleOptimisticCreate = useCallback((data: TransactionFormData) => {
    const optimisticTx: Transaction = {
      id: `temp-${Date.now()}`,
      transaction_type: data.transaction_type,
      amount: data.amount,
      merchant: data.merchant,
      date: data.date,
      account_type_id: data.account_type_id,
      category: data.category,
      notes: data.notes || "",
    }
    setTransactions(prev => [optimisticTx, ...prev])
  }, [])

  const handleOptimisticUpdate = useCallback((id: string, data: Partial<Transaction>) => {
    setTransactions(prev =>
      prev.map(t => (t.id === id ? { ...t, ...data } : t))
    )
  }, [])

  const handleOptimisticDelete = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-muted/30 p-6 flex flex-col">
      <div className="max-w-[1800px] mx-auto w-full flex flex-col flex-1 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <Button 
            className="bg-[#FF6B4A] hover:bg-[#FF6B4A]/90 text-white"
            onClick={() => setIsAddTransactionOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add transaction
          </Button>
        </div>

        {/* Three Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">
          {/* Transactions Section */}
          <div className="lg:col-span-4 flex flex-col">
            <div className="bg-background rounded-xl hover:shadow-xl border overflow-hidden flex flex-col h-full transition-shadow duration-200">
              <div className="px-6 py-4 border-b shrink-0">
                <h2 className="text-xl font-semibold">Transactions</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <TransactionList 
                  transactions={filteredTransactions}
                  categories={categories}
                  accounts={accounts}
                  onTransactionClick={handleTransactionClick}
                />
              </div>
            </div>
          </div>

          {/* Right Column with Filter & Summary - Sticky */}
          <div className="space-y-4 flex flex-col sticky top-6 self-start h-[calc(100vh-3rem)]">
            {/* Filter & Sort Section */}
            <div className="bg-background rounded-xl hover:shadow-xl border overflow-hidden flex flex-col shrink-0 transition-shadow duration-200">
              <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-lg font-semibold">Filter & sort</h2>
              </div>
              <div className="overflow-y-auto">
                <TransactionFiltersPanel
                  filters={filters}
                  onFiltersChange={setFilters}
                  accountTypes={accounts}
                  categories={categories}
                />
              </div>
            </div>

            {/* Summary Section - Takes remaining height */}
            <div className="bg-background rounded-xl hover:shadow-xl border overflow-hidden flex flex-col flex-1 min-h-0 transition-shadow duration-200">
              <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-lg font-semibold">Summary</h2>
              </div>
              <div className="overflow-y-auto">
                <TransactionSummary transactions={filteredTransactions} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AddTransactionDialog
        open={isAddTransactionOpen}
        onOpenChange={setIsAddTransactionOpen}
        onTransactionCreated={handleOptimisticCreate}
        onAfterSave={refreshData}
        accounts={accounts}
        categories={categories}
      />

      <EditTransactionDialog
        open={isEditTransactionOpen}
        onOpenChange={setIsEditTransactionOpen}
        transaction={selectedTransaction}
        onTransactionUpdated={handleOptimisticUpdate}
        onTransactionDeleted={handleOptimisticDelete}
        onAfterSave={refreshData}
        accounts={accounts}
        categories={categories}
      />
    </div>
  )
}
