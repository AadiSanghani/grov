"use client"

import * as React from "react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Account } from "@/lib/accounts"
import { Category } from "@/lib/categories"
import { CalendarIcon, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

interface TransactionFiltersProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  accountTypes: Account[]
  categories: Category[]
}

function formatDate(date: Date | undefined) {
  if (!date) return ""
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = String(date.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

export const TransactionFiltersPanel = React.memo(function TransactionFiltersPanel({
  filters,
  onFiltersChange,
  accountTypes,
  categories,
}: TransactionFiltersProps) {
  const handleSortChange = (value: string) => {
    onFiltersChange({
      ...filters,
      sortBy: value as "date" | "amount" | "merchant",
    })
  }

  const resetFilters = () => {
    onFiltersChange({
      ...filters,
      search: "",
      dateStart: undefined,
      dateEnd: undefined,
      account_types: [],
      categories: [],
    })
  }

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.dateStart ? 1 : 0) +
    (filters.dateEnd ? 1 : 0) +
    (filters.account_types.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0)

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Filters
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={resetFilters}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Search</Label>
        <Input
          placeholder="Search merchant, category, or notes..."
          value={filters.search}
          onChange={(e) => {
            onFiltersChange({
              ...filters,
              search: e.target.value,
            })
          }}
          className="h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Date range</Label>
        <div className="grid grid-cols-2 gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-left font-normal text-sm",
                  !filters.dateStart && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateStart ? formatDate(filters.dateStart) : "Start"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateStart}
                onSelect={(date) => {
                  onFiltersChange({
                    ...filters,
                    dateStart: date,
                  })
                }}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-left font-normal text-sm",
                  !filters.dateEnd && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateEnd ? formatDate(filters.dateEnd) : "End"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateEnd}
                onSelect={(date) => {
                  onFiltersChange({
                    ...filters,
                    dateEnd: date,
                  })
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Sort by</Label>
        <Select value={filters.sortBy} onValueChange={handleSortChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date (new to old)</SelectItem>
            <SelectItem value="amount">Amount (high to low)</SelectItem>
            <SelectItem value="merchant">Merchant (A to Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Account</Label>
        <Select
          value={filters.account_types.length > 0 ? filters.account_types[0] : "all"}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              account_types: value === "all" ? [] : [value],
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {accountTypes.filter((a) => a.id != null).map((account) => (
              <SelectItem key={account.id} value={account.id!.toString()}>
                {account.account_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Category</Label>
        <Select
          value={filters.categories.length > 0 ? filters.categories[0] : "all"}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              categories: value === "all" ? [] : [value],
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id?.toString() || ""}>
                {category.emoji} {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
})
