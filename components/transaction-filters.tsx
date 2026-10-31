"use client"

import * as React from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import type { TransactionFilters } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { Account } from "@/lib/accounts"
import type { Category } from "@/lib/categories"
import { categoryNameToValue, toLocalDateString } from "@/lib/utils"
import { defaultFilters } from "@/lib/ledger/filters"
import { parseShortcutDateInput } from "@/lib/ledger/date-input"

interface TransactionFiltersProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  accountTypes: Account[]
  categories: Category[]
}
const selectClass =
  "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"

export const TransactionFiltersPanel = React.memo(
  function TransactionFiltersPanel({
    filters,
    onFiltersChange,
    accountTypes,
    categories,
  }: TransactionFiltersProps) {
    const update = (patch: Partial<TransactionFilters>) =>
      onFiltersChange({ ...filters, ...patch })
    return (
      <div className="grid grid-cols-1 gap-4 border-t bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-account">Account</Label>
          <select
            id="filter-account"
            className={selectClass}
            value={filters.account_types[0] ?? "all"}
            onChange={(e) =>
              update({
                account_types: e.target.value === "all" ? [] : [e.target.value],
              })
            }
          >
            <option value="all">All accounts</option>
            <option value="__unassigned__">Unassigned</option>
            {accountTypes
              .filter((a) => a.id != null)
              .map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.account_name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-category">Category</Label>
          <select
            id="filter-category"
            className={selectClass}
            value={filters.categories[0] ?? "all"}
            onChange={(e) =>
              update({
                categories: e.target.value === "all" ? [] : [e.target.value],
              })
            }
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id ?? c.name} value={categoryNameToValue(c.name)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-from">From date</Label>
          <Input
            id="filter-from"
            type="date"
            className="h-9"
            value={
              filters.dateStart ? toLocalDateString(filters.dateStart) : ""
            }
            onChange={(e) =>
              update({
                dateStart: e.target.value
                  ? (parseShortcutDateInput(e.target.value, new Date()) ??
                    undefined)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-to">To date</Label>
          <Input
            id="filter-to"
            type="date"
            className="h-9"
            value={filters.dateEnd ? toLocalDateString(filters.dateEnd) : ""}
            onChange={(e) =>
              update({
                dateEnd: e.target.value
                  ? (parseShortcutDateInput(e.target.value, new Date()) ??
                    undefined)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-min">Minimum amount</Label>
          <Input
            id="filter-min"
            type="number"
            min="0"
            step="0.01"
            className="h-9"
            placeholder="No minimum"
            value={filters.amountMin ?? ""}
            onChange={(e) =>
              update({
                amountMin:
                  e.target.value === ""
                    ? undefined
                    : Math.max(0, Number(e.target.value)),
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max">Maximum amount</Label>
          <Input
            id="filter-max"
            type="number"
            min="0"
            step="0.01"
            className="h-9"
            placeholder="No maximum"
            value={filters.amountMax ?? ""}
            onChange={(e) =>
              update({
                amountMax:
                  e.target.value === ""
                    ? undefined
                    : Math.max(0, Number(e.target.value)),
              })
            }
          />
        </div>
        <p className="self-end text-xs text-muted-foreground sm:col-span-2">
          Amounts filter the full transaction total. Spending summaries use your
          share.
        </p>
      </div>
    )
  }
)

export function TransactionToolbar(props: TransactionFiltersProps) {
  const { filters, onFiltersChange, accountTypes, categories } = props
  const [expanded, setExpanded] = React.useState(false)
  const update = (patch: Partial<TransactionFilters>) =>
    onFiltersChange({ ...filters, ...patch })
  const chips: { key: string; label: string; remove: () => void }[] = []
  if (filters.search)
    chips.push({
      key: "q",
      label: `Search: ${filters.search}`,
      remove: () => update({ search: "" }),
    })
  filters.account_types.forEach((id) =>
    chips.push({
      key: `account-${id}`,
      label:
        id === "__unassigned__"
          ? "Unassigned"
          : (accountTypes.find((a) => String(a.id) === id)?.account_name ??
            "Account"),
      remove: () =>
        update({
          account_types: filters.account_types.filter((value) => value !== id),
        }),
    })
  )
  filters.categories.forEach((value) =>
    chips.push({
      key: `category-${value}`,
      label:
        categories.find((c) => categoryNameToValue(c.name) === value)?.name ??
        value,
      remove: () =>
        update({ categories: filters.categories.filter((c) => c !== value) }),
    })
  )
  if (filters.dateStart)
    chips.push({
      key: "from",
      label: `From ${toLocalDateString(filters.dateStart)}`,
      remove: () => update({ dateStart: undefined }),
    })
  if (filters.dateEnd)
    chips.push({
      key: "to",
      label: `To ${toLocalDateString(filters.dateEnd)}`,
      remove: () => update({ dateEnd: undefined }),
    })
  if (filters.amountMin !== undefined)
    chips.push({
      key: "min",
      label: `Min $${filters.amountMin}`,
      remove: () => update({ amountMin: undefined }),
    })
  if (filters.amountMax !== undefined)
    chips.push({
      key: "max",
      label: `Max $${filters.amountMax}`,
      remove: () => update({ amountMax: undefined }),
    })

  return (
    <section
      aria-label="Filter transactions"
      className="min-w-0 rounded-xl border bg-background"
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label="Search transactions"
            type="search"
            className="h-9 pl-9"
            placeholder="Search merchant, category, or notes"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort transactions"
            className={`${selectClass} w-auto`}
            value={`${filters.sortBy}-${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split("-") as [
                TransactionFilters["sortBy"],
                TransactionFilters["sortOrder"],
              ]
              update({ sortBy, sortOrder })
            }}
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
            <option value="merchant-asc">Merchant A–Z</option>
            <option value="merchant-desc">Merchant Z–A</option>
          </select>
          <Button
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            aria-expanded={expanded}
            aria-controls="ledger-advanced-filters"
            onClick={() => setExpanded((value) => !value)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters{chips.length > 0 ? ` (${chips.length})` : ""}
          </Button>
        </div>
      </div>
      {chips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-3 pb-3"
          aria-label="Active filters"
        >
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              aria-label={`Remove ${chip.label}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="truncate">{chip.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            className="px-2 py-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() =>
              onFiltersChange({
                ...defaultFilters,
                sortBy: filters.sortBy,
                sortOrder: filters.sortOrder,
              })
            }
          >
            Clear filters
          </button>
        </div>
      )}
      {expanded && (
        <div id="ledger-advanced-filters">
          <TransactionFiltersPanel {...props} />
        </div>
      )}
    </section>
  )
}
