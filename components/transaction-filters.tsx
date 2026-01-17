"use client"

import { TransactionFilters } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { Account } from "@/lib/accounts"

interface TransactionFiltersProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  accounts: Account[]
}

export function TransactionFiltersPanel({ filters, onFiltersChange, accounts }: TransactionFiltersProps) {
  const [showMoreOptions, setShowMoreOptions] = useState(false)

  const handleSortChange = (value: string) => {
    onFiltersChange({
      ...filters,
      sortBy: value as "date" | "amount" | "merchant",
    })
  }

  const handleSearchChange = (value: string) => {
    onFiltersChange({
      ...filters,
      search: value,
    })
  }

  const handleAccountChange = (value: string) => {
    onFiltersChange({
      ...filters,
      accounts: value === "all" ? [] : [value],
    })
  }

  const handleCategoryChange = (value: string) => {
    onFiltersChange({
      ...filters,
      categories: value === "all" ? [] : [value],
    })
  }

  const handleAmountMinChange = (value: string) => {
    const num = parseFloat(value)
    onFiltersChange({
      ...filters,
      amountMin: isNaN(num) ? undefined : num,
    })
  }

  const handleAmountMaxChange = (value: string) => {
    const num = parseFloat(value)
    onFiltersChange({
      ...filters,
      amountMax: isNaN(num) ? undefined : num,
    })
  }

  return (
    <div className="space-y-6 p-6 bg-background border-l">
      <div>
        <h2 className="text-lg font-semibold mb-4">Filter & sort</h2>
      </div>

      {/* Sort by */}
      <div className="space-y-2">
        <Label>Sort by</Label>
        <Select value={filters.sortBy} onValueChange={handleSortChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select sort order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date (new to old)</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="merchant">Merchant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Search */}
      <div className="space-y-2">
        <Label>Search</Label>
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      <Separator />

      {/* Accounts */}
      <div className="space-y-2">
        <Label>Accounts</Label>
        <Select 
          value={filters.accounts.length > 0 ? filters.accounts[0] : "all"}
          onValueChange={handleAccountChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id?.toString() || ""}>
                {account.account_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Categories */}
      <div className="space-y-2">
        <Label>Categories</Label>
        <Select
          value={filters.categories.length > 0 ? filters.categories[0] : "all"}
          onValueChange={handleCategoryChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="paychecks">💵 Paychecks</SelectItem>
            <SelectItem value="groceries">🛒 Groceries</SelectItem>
            <SelectItem value="restaurants">🍽️ Restaurants</SelectItem>
            <SelectItem value="gas">⛽ Gas</SelectItem>
            <SelectItem value="mortgage">🏠 Mortgage</SelectItem>
            <SelectItem value="phone">📱 Phone</SelectItem>
            <SelectItem value="internet-cable">🌐 Internet & Cable</SelectItem>
            <SelectItem value="coffee-shops">☕ Coffee Shops</SelectItem>
            <SelectItem value="auto-payment">🚗 Auto Payment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Amounts */}
      <div className="space-y-2">
        <Label>Amounts</Label>
        <div className="space-y-2">
          <Input
            type="number"
            placeholder="All amounts"
            value={filters.amountMin || ""}
            onChange={(e) => handleAmountMinChange(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      {/* Date range */}
      <div className="space-y-2">
        <Label>Date range</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            placeholder="Start date"
            value={filters.dateStart ? format(filters.dateStart, "yyyy-MM-dd") : ""}
            onChange={(e) => {
              onFiltersChange({
                ...filters,
                dateStart: e.target.value ? new Date(e.target.value) : undefined,
              })
            }}
          />
          <Input
            type="date"
            placeholder="End date"
            value={filters.dateEnd ? format(filters.dateEnd, "yyyy-MM-dd") : ""}
            onChange={(e) => {
              onFiltersChange({
                ...filters,
                dateEnd: e.target.value ? new Date(e.target.value) : undefined,
              })
            }}
          />
        </div>
      </div>

      <Separator />

      {/* Tags (placeholder) */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* More options (placeholder) */}
      <Button
        variant="ghost"
        className="w-full justify-between"
        onClick={() => setShowMoreOptions(!showMoreOptions)}
        disabled
      >
        More options
        <ChevronDown className={`w-4 h-4 transition-transform ${showMoreOptions ? "rotate-180" : ""}`} />
      </Button>
    </div>
  )
}

// Helper function
function format(date: Date, formatStr: string): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  if (formatStr === "yyyy-MM-dd") {
    return `${year}-${month}-${day}`
  }
  
  return date.toLocaleDateString()
}
