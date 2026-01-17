"use client"

import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { Plus } from "lucide-react"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { EditTransactionDialog } from "@/components/edit-transaction-dialog"
import { TransactionList } from "@/components/transaction-list"
import { TransactionFiltersPanel } from "@/components/transaction-filters"
import { TransactionSummary } from "@/components/transaction-summary"
import { Transaction, TransactionFilters } from "@/lib/types"
import { mockTransactions } from "@/lib/mock-transactions"
import { getAccounts, type Account } from "@/lib/accounts"

export default function Transactions() {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false)
  const [isEditTransactionOpen, setIsEditTransactionOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<TransactionFilters>({
    sortBy: "date",
    sortOrder: "desc",
    search: "",
    accounts: [],
    categories: [],
    tags: [],
  })

  // Load transactions and accounts on mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // For now, use mock data
      // TODO: Replace with actual server action once database is set up
      // const data = await getTransactions()
      setTransactions(mockTransactions)
      
      // Load accounts for filter
      const accountsData = await getAccounts()
      setAccounts(accountsData || [])
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Apply filters to transactions
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
    if (filters.accounts.length > 0) {
      filtered = filtered.filter(t => filters.accounts.includes(t.account_id))
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

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (filters.sortBy) {
        case "date":
          comparison = b.date.getTime() - a.date.getTime() // Default: newest first
          break
        case "amount":
          comparison = b.amount - a.amount
          break
        case "merchant":
          comparison = a.merchant.localeCompare(b.merchant)
          break
      }
      
      return filters.sortOrder === "asc" ? -comparison : comparison
    })

    return filtered
  }, [transactions, filters])

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsEditTransactionOpen(true)
  }

  const handleTransactionUpdated = () => {
    // Reload transactions after update or delete
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Transactions</h1>
            <Button
              variant="ghost"
              size="sm"
              className="text-sm text-muted-foreground hover:text-foreground"
              disabled
            >
              Customize rules
            </Button>
          </div>
          <Button 
            className="bg-[#FF6B4A] hover:bg-[#FF6B4A]/90 text-white"
            onClick={() => setIsAddTransactionOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add transaction
          </Button>
        </div>

        {/* Filter Bar - Top of list area */}
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-sm"
              disabled
            >
              All transactions
            </Button>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                disabled
              >
                Edit multiple
              </Button>
              <Button
                variant="ghost"
                size="sm"
              >
                Filter & sort
              </Button>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto p-6">
          <TransactionList 
            transactions={filteredTransactions}
            onTransactionClick={handleTransactionClick}
          />
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-[400px] flex flex-col border-l">
        {/* Filters */}
        <div className="flex-1 overflow-y-auto">
          <TransactionFiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            accounts={accounts}
          />
        </div>

        {/* Summary */}
        <div className="border-t">
          <TransactionSummary transactions={filteredTransactions} />
        </div>
      </div>

      {/* Dialogs */}
      <AddTransactionDialog
        open={isAddTransactionOpen}
        onOpenChange={setIsAddTransactionOpen}
        onTransactionCreated={handleTransactionUpdated}
      />

      <EditTransactionDialog
        open={isEditTransactionOpen}
        onOpenChange={setIsEditTransactionOpen}
        transaction={selectedTransaction}
        onTransactionUpdated={handleTransactionUpdated}
      />
    </div>
  )
}
