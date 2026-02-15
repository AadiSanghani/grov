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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Account } from "@/lib/accounts"
import { Category } from "@/lib/categories"
import { CalendarIcon, Check, ChevronsUpDown, RotateCcw } from "lucide-react"
import { categoryNameToValue, cn } from "@/lib/utils"

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
  const [categoryOpen, setCategoryOpen] = React.useState(false)

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
  const selectedCategoryValue = filters.categories.length > 0 ? filters.categories[0] : "all"
  const selectedCategory = categories.find(
    (category) => categoryNameToValue(category.name) === selectedCategoryValue
  )

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
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={categoryOpen}
              className="h-9 w-full justify-between font-normal"
            >
              {selectedCategory ? (
                <span className="truncate">
                  {selectedCategory.emoji} {selectedCategory.name}
                </span>
              ) : (
                "All categories"
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Search categories..." />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all categories"
                    onSelect={() => {
                      onFiltersChange({
                        ...filters,
                        categories: [],
                      })
                      setCategoryOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedCategoryValue === "all" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All categories
                  </CommandItem>
                  {categories.map((category) => {
                    const normalized = categoryNameToValue(category.name)
                    return (
                      <CommandItem
                        key={category.id ?? category.name}
                        value={`${category.name} ${category.emoji}`}
                        onSelect={() => {
                          onFiltersChange({
                            ...filters,
                            categories: [normalized],
                          })
                          setCategoryOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedCategoryValue === normalized ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="mr-2">{category.emoji}</span>
                        <span className="truncate">{category.name}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
})
