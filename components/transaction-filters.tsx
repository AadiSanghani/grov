"use client"

import { TransactionFilters } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Account } from "@/lib/accounts"

interface TransactionFiltersProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  accounts: Account[]
}

export function TransactionFiltersPanel({ filters, onFiltersChange, accounts }: TransactionFiltersProps) {
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

  return (
    <div className="space-y-3 p-4">
      {/* Search - Full Width */}
      <div className="space-y-1.5">
        <Label className="text-sm">Search</Label>
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-9"
        />
      </div>

      <Separator />

      {/* Date range - Full Width */}
      <div className="space-y-1.5">
        <Label className="text-sm">Date range</Label>
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
            className="h-9 text-sm"
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
            className="h-9 text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* Sort by, Accounts, Categories - Each on own row */}
      <div className="space-y-3">
        {/* Sort by */}
        <div className="space-y-1.5">
          <Label className="text-sm">Sort by</Label>
          <Select value={filters.sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date (new to old)</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="merchant">Merchant</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Accounts */}
        <div className="space-y-1.5">
          <Label className="text-sm">Accounts</Label>
          <Select 
            value={filters.accounts.length > 0 ? filters.accounts[0] : "all"}
            onValueChange={handleAccountChange}
          >
            <SelectTrigger className="h-9">
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

        {/* Categories */}
        <div className="space-y-1.5">
          <Label className="text-sm">Categories</Label>
          <Select
            value={filters.categories.length > 0 ? filters.categories[0] : "all"}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="h-9">
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
      </div>
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
