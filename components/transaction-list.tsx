"use client"

import * as React from "react"
import { format } from "date-fns"
import { Copy, EllipsisVertical, FileText, Plus } from "lucide-react"

import { Transaction } from "@/lib/types"
import {
  cn,
  findCategoryByValue,
  getSpendingAmount,
  isReimbursementTransaction,
  toLocalDateString,
} from "@/lib/utils"
import { Category } from "@/lib/categories"
import { type Account } from "@/lib/accounts"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Density = "compact" | "balanced" | "comfortable"
type AmountColorMode = "semantic-minimal" | "strict-semantic" | "monochrome"

interface TransactionListProps {
  transactions: Transaction[]
  categories: Category[]
  accounts?: Account[]
  density?: Density
  amountColorMode?: AmountColorMode
  showNotesPreview?: boolean
  onTransactionClick: (transaction: Transaction) => void
  onDuplicateTransaction: (transaction: Transaction) => void
  onCreateForDate?: (date: Date) => void
}

interface GroupedTransactions {
  isoDate: string
  displayDate: string
  transactions: Transaction[]
  total: number
}

const ROW_AMOUNT_COLUMN_WIDTH = "w-[10.5rem]"
const ACTION_COLUMN_WIDTH = "w-10"

const densityClassMap: Record<Density, string> = {
  compact: "py-2",
  balanced: "py-2.5",
  comfortable: "py-3.5",
}

function accountName(accounts: Account[], id: string | null | undefined) {
  if (id == null || id === "") return "Unassigned"
  const name = accounts.find((a) => a.id?.toString() === id)?.account_name
  return name ?? "Unassigned"
}

function getAmountTone(
  mode: AmountColorMode,
  type: Transaction["transaction_type"]
) {
  if (mode === "monochrome") return "text-foreground"

  if (mode === "semantic-minimal") {
    return type === "transfer" ? "text-muted-foreground" : "text-foreground"
  }

  if (type === "incoming") return "text-primary"
  if (type === "outgoing") return "text-destructive"
  return "text-muted-foreground"
}

function getSignedAmount(transaction: Transaction) {
  if (transaction.transaction_type === "outgoing") {
    return {
      sign: "-",
      value: getSpendingAmount(transaction),
    }
  }
  if (transaction.transaction_type === "incoming") {
    return {
      sign: "+",
      value: transaction.amount,
    }
  }
  return {
    sign: "",
    value: transaction.amount,
  }
}

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getDayNetClass(total: number) {
  if (Math.abs(total) < 0.005) return "text-foreground"
  return total > 0 ? "text-primary" : "text-destructive"
}

export const TransactionList = React.memo(function TransactionList({
  transactions,
  categories,
  accounts = [],
  density = "balanced",
  amountColorMode = "semantic-minimal",
  showNotesPreview = true,
  onTransactionClick,
  onDuplicateTransaction,
  onCreateForDate,
}: TransactionListProps) {
  const [activeMenuId, setActiveMenuId] = React.useState<string | undefined>(undefined)

  const groupedTransactions = React.useMemo<GroupedTransactions[]>(() => {
    const grouped = new Map<string, GroupedTransactions>()

    transactions.forEach((transaction) => {
      const isoDate = toLocalDateString(transaction.date)
      const current = grouped.get(isoDate)
      const dateEntry =
        current ??
        {
          isoDate,
          displayDate: format(transaction.date, "MMMM dd, yyyy"),
          transactions: [],
          total: 0,
        }

      dateEntry.transactions.push(transaction)

      if (transaction.transaction_type === "incoming") {
        dateEntry.total += transaction.amount
      } else if (transaction.transaction_type === "outgoing") {
        dateEntry.total -= getSpendingAmount(transaction)
      }
      // transfers do not impact daily net

      grouped.set(isoDate, dateEntry)
    })

    return Array.from(grouped.values())
  }, [transactions])

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-1 text-base font-medium text-foreground">No transactions found</p>
        <p className="text-sm text-muted-foreground">Adjust filters or add your next transaction</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groupedTransactions.map(({ isoDate, displayDate, transactions: dayTransactions, total }) => (
        <section key={isoDate} className="space-y-1.5">
          <header className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{displayDate}</h3>
              {onCreateForDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => onCreateForDate(new Date(`${isoDate}T12:00:00`))}
                  aria-label={`Add transaction for ${displayDate}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-right text-sm font-semibold tabular-nums md:hidden",
                  getDayNetClass(total)
                )}
              >
                {total >= 0 ? "+" : "-"}${formatMoney(Math.abs(total))}
              </span>
              <span
                className={cn(
                  "hidden text-right text-sm font-semibold tabular-nums md:block",
                  ROW_AMOUNT_COLUMN_WIDTH,
                  getDayNetClass(total)
                )}
              >
                {total >= 0 ? "+" : "-"}${formatMoney(Math.abs(total))}
              </span>
              <span className={cn("hidden md:block", ACTION_COLUMN_WIDTH)} />
            </div>
          </header>

          <div className="space-y-1">
            {dayTransactions.map((transaction) => {
              const isTransfer = transaction.transaction_type === "transfer"
              const isReimbursement = isReimbursementTransaction(transaction)
              const categoryInfo = findCategoryByValue(categories, transaction.category)
              const transferLabel =
                isTransfer &&
                transaction.to_account_type_id != null &&
                transaction.to_account_type_id !== ""
                  ? `${accountName(accounts, transaction.account_type_id)} → ${accountName(accounts, transaction.to_account_type_id)}`
                  : null
              const amountData = getSignedAmount(transaction)
              const amountTone = getAmountTone(amountColorMode, transaction.transaction_type)
              const txNotes = transaction.notes?.trim()

              return (
                <div
                  key={transaction.id}
                  className={cn(
                    "flex items-stretch rounded-lg border border-transparent transition-colors hover:border-border hover:bg-muted/30",
                    densityClassMap[density]
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onTransactionClick(transaction)}
                    className="grid flex-1 grid-cols-1 gap-2 px-3 text-left md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_10.5rem] md:items-start"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium leading-6">
                        {isTransfer ? (transferLabel ?? transaction.merchant) : transaction.merchant}
                      </p>

                      <div className="flex min-h-5 flex-wrap items-center gap-1.5">
                        {isReimbursement && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Reimbursement
                          </span>
                        )}
                        <span className="truncate text-xs text-muted-foreground">
                          {accountName(accounts, transaction.account_type_id)}
                        </span>
                      </div>

                      {showNotesPreview && txNotes && (
                        <p
                          className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
                          title={txNotes}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="sr-only">Note</span>
                          <span className="truncate">{txNotes}</span>
                        </p>
                      )}
                    </div>

                    <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground md:flex">
                      {isTransfer ? (
                        <span className="truncate">Transfer</span>
                      ) : categoryInfo ? (
                        <>
                          <span className="shrink-0">{categoryInfo.emoji}</span>
                          <span className="truncate">{categoryInfo.label}</span>
                        </>
                      ) : (
                        <span className="truncate">Uncategorized</span>
                      )}
                    </div>

                    <div className={cn("text-left md:text-right", ROW_AMOUNT_COLUMN_WIDTH)}>
                      <p className={cn("text-sm font-semibold tabular-nums", amountTone)}>
                        {amountData.sign}${formatMoney(amountData.value)}
                      </p>
                      {transaction.transaction_type === "outgoing" &&
                        transaction.spending_amount != null &&
                        transaction.spending_amount !== transaction.amount && (
                          <p className="truncate text-xs text-muted-foreground">
                            your share: ${formatMoney(transaction.spending_amount)}
                          </p>
                        )}
                    </div>
                  </button>

                  <div className={cn("flex items-start justify-center pt-1", ACTION_COLUMN_WIDTH)}>
                    <Popover
                      open={activeMenuId === transaction.id}
                      onOpenChange={(isOpen) => {
                        setActiveMenuId(isOpen ? transaction.id : undefined)
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Transaction actions"
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-40 p-1">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveMenuId(undefined)
                            onDuplicateTransaction(transaction)
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
})
