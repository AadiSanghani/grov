"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  cn,
  formatCategoriesForUI,
  getDefaultIncomingSubtypeForCategory,
  normalizeCalendarDate,
  toLocalDateString,
} from "@/lib/utils"
import { CalendarIcon, Check, ChevronsUpDown, MinusCircle, PlusCircle, Trash2, ArrowRightLeft, Plus, ChevronDown, ChevronUp } from "lucide-react"
import { format } from "date-fns"
import { type Account } from "@/lib/accounts"
import { Transaction } from "@/lib/types"
import { updateTransaction, deleteTransaction } from "@/lib/transactions"
import { getDeductionsByTransactionId } from "@/lib/deductions"
import { type Category } from "@/lib/categories"
import { useDataContext } from "@/app/data-context"

interface EditTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  onTransactionUpdated: (id: string, data: Partial<Transaction>) => void
  onTransactionDeleted?: (id: string) => void
  onAfterSave?: () => void
  accounts: Account[]
  categories: Category[]
}

export function EditTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onTransactionUpdated,
  onTransactionDeleted,
  onAfterSave,
  accounts,
  categories,
}: EditTransactionDialogProps) {
  const [transactionType, setTransactionType] = useState<"outgoing" | "incoming" | "transfer">("outgoing")
  const [amount, setAmount] = useState("")
  const [displayAmount, setDisplayAmount] = useState("$")
  const [merchant, setMerchant] = useState("")
  const [merchantOpen, setMerchantOpen] = useState(false)
  const [date, setDate] = useState<Date>(() => normalizeCalendarDate(new Date()))
  const [dateOpen, setDateOpen] = useState(false)
  const [accountTypeId, setAccountTypeId] = useState("")
  const [accountOpen, setAccountOpen] = useState(false)
  const [toAccountTypeId, setToAccountTypeId] = useState("")
  const [toAccountOpen, setToAccountOpen] = useState(false)
  const [category, setCategory] = useState("")
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [spendingAmount, setSpendingAmount] = useState("")
  const [displaySpendingAmount, setDisplaySpendingAmount] = useState("$")
  const [deductionsOpen, setDeductionsOpen] = useState(false)
  const [deductions, setDeductions] = useState<{ label: string; amount: string; displayAmount: string; targetAccountId: string }[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { merchants, addMerchant } = useDataContext()
  const merchantNames = useMemo(() => merchants.map((m) => m.name), [merchants])
  const formattedCategories = useMemo(
    () => (categories.length > 0 ? formatCategoriesForUI(categories) : []),
    [categories]
  )

  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Investments"),
    [accounts]
  )

  const addDeductionRow = () => {
    setDeductions((prev) => [...prev, { label: "", amount: "", displayAmount: "$", targetAccountId: "" }])
  }

  const removeDeductionRow = (index: number) => {
    setDeductions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateDeduction = (index: number, field: string, value: string) => {
    setDeductions((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        if (field === "amount") {
          let v = value.replace(/[^0-9.]/g, "")
          if (v === "") return { ...d, amount: "", displayAmount: "$" }
          const parts = v.split(".")
          if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("")
          if (parts.length === 2 && parts[1].length > 2) v = parts[0] + "." + parts[1].slice(0, 2)
          const [intPart, decPart] = v.split(".")
          const fmtInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
          const display = decPart !== undefined ? `$${fmtInt}.${decPart}` : `$${fmtInt}`
          return { ...d, amount: v, displayAmount: display }
        }
        return { ...d, [field]: value }
      })
    )
  }

  const deductionTotal = useMemo(
    () => deductions.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    [deductions]
  )

  const grossIncome = useMemo(() => {
    const net = parseFloat(amount) || 0
    return net + deductionTotal
  }, [amount, deductionTotal])

  useEffect(() => {
    if (open && transaction) {
      setTransactionType(transaction.transaction_type)
      setAmount(transaction.amount.toString())
      setDisplayAmount(`$${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      setMerchant(transaction.merchant)
      setDate(normalizeCalendarDate(transaction.date))
      setAccountTypeId(transaction.account_type_id != null ? transaction.account_type_id.toString() : "")
      setToAccountTypeId(transaction.to_account_type_id != null ? String(transaction.to_account_type_id) : "")
      setCategory(transaction.category)
      setNotes(transaction.notes || "")
      if (transaction.spending_amount != null) {
        setSpendingAmount(transaction.spending_amount.toString())
        setDisplaySpendingAmount(`$${transaction.spending_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      } else {
        setSpendingAmount("")
        setDisplaySpendingAmount("$")
      }
      if (transaction.transaction_type === "incoming" && transaction.id) {
        getDeductionsByTransactionId(transaction.id)
          .then((deds) => {
            if (deds.length > 0) {
              setDeductions(
                deds.map((d) => ({
                  label: d.label,
                  amount: String(d.amount),
                  displayAmount: `$${Number(d.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  targetAccountId: d.target_account_id != null ? String(d.target_account_id) : "",
                }))
              )
              setDeductionsOpen(true)
            } else {
              setDeductions([])
              setDeductionsOpen(false)
            }
          })
          .catch(() => {
            setDeductions([])
            setDeductionsOpen(false)
          })
      } else {
        setDeductions([])
        setDeductionsOpen(false)
      }
    }
  }, [open, transaction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!transaction?.id) return
    
    // Validate amount is a number
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Please enter a valid amount")
      return
    }

    if (transactionType === "transfer") {
      if (!accountTypeId || !toAccountTypeId) {
        alert("Please select both From and To accounts")
        return
      }
      if (accountTypeId === toAccountTypeId) {
        alert("From and To accounts must be different")
        return
      }
    }

    let parsedSpendingAmount: number | null = null
    if (transactionType === "outgoing" && spendingAmount !== "") {
      const num = parseFloat(spendingAmount)
      if (isNaN(num) || num < 0 || num > numAmount) {
        alert("My share must be between $0 and the total amount")
        return
      }
      parsedSpendingAmount = num
    }

    // Parse deductions for incoming transactions
    let parsedDeductions: { label: string; amount: number; target_account_id?: number | null }[] = []
    if (transactionType === "incoming" && deductions.length > 0) {
      for (const d of deductions) {
        const dedAmount = parseFloat(d.amount)
        if (!d.label.trim()) {
          alert("Please enter a label for all deductions")
          return
        }
        if (isNaN(dedAmount) || dedAmount <= 0) {
          alert("Please enter a valid amount for all deductions")
          return
        }
        parsedDeductions.push({
          label: d.label.trim(),
          amount: dedAmount,
          target_account_id: d.targetAccountId ? parseInt(d.targetAccountId, 10) : null,
        })
      }
    }

    const transactionId = transaction.id
    const merchantValue = (transactionType === "transfer" ? (merchant || "Transfer") : merchant).trim()
    const updateData: Partial<Transaction> & { deductions?: { label: string; amount: number; target_account_id?: number | null }[] } = {
      transaction_type: transactionType,
      incoming_subtype:
        transactionType === "incoming"
          ? getDefaultIncomingSubtypeForCategory(category)
          : null,
      amount: numAmount,
      merchant: merchantValue,
      date,
      account_type_id: accountTypeId || null,
      category: transactionType === "transfer" ? (category || "transfer") : category,
      notes,
      spending_amount: transactionType === "outgoing" ? parsedSpendingAmount ?? null : null,
    }
    if (transactionType === "transfer") {
      updateData.to_account_type_id = toAccountTypeId
    } else {
      updateData.to_account_type_id = null
    }
    updateData.deductions = parsedDeductions

    // Close dialog immediately for snappy UX
    onOpenChange(false)


    onTransactionUpdated(transactionId, updateData)

    const serverUpdateData: Parameters<typeof updateTransaction>[1] = {
      ...updateData,
      date: toLocalDateString(date),
    }

    const shouldPersistMerchant =
      transactionType !== "transfer" &&
      merchantValue.length > 0 &&
      !merchantNames.some((m) => m.toLowerCase() === merchantValue.toLowerCase())

    try {
      if (shouldPersistMerchant) {
        await addMerchant(merchantValue)
      }
      await updateTransaction(transactionId, serverUpdateData)
    } catch (error) {
      console.error("Failed to update transaction:", error)
      toast.error("Failed to update transaction. Please try again. Error: " + error, {
        duration: 5000,
        position: "top-right",
      })
    }

    onAfterSave?.()
  }

  const handleDelete = async () => {
    if (!transaction?.id) return

    // Capture the ID before closing
    const transactionId = transaction.id

    // Close dialogs immediately for snappy UX
    setShowDeleteConfirm(false)
    onOpenChange(false)

    // Optimistic: remove from the list instantly
    onTransactionDeleted?.(transactionId)

    // Delete transaction in the background
    try {
      await deleteTransaction(transactionId)
    } catch (error) {
      console.error("Failed to delete transaction:", error)
      toast.error("Failed to delete transaction. Please try again. Error: " + error, {
        duration: 5000,
        position: "top-right",
      })
    }

    onAfterSave?.()
  }

  const filteredMerchants = useMemo(
    () => merchantNames.filter((m) => m.toLowerCase().includes(merchant.toLowerCase())),
    [merchantNames, merchant]
  )

  const isCustomMerchant = merchant && !merchantNames.some(m =>
    m.toLowerCase() === merchant.toLowerCase()
  )

  const selectedCategory = useMemo(
    () => formattedCategories.flatMap((group) => group.items).find((item) => item.value === category),
    [formattedCategories, category]
  )

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id?.toString() === accountTypeId),
    [accounts, accountTypeId]
  )

  if (!transaction) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Transaction Type Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={transactionType === "outgoing" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  transactionType === "outgoing" 
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" 
                    : "hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setTransactionType("outgoing")}
              >
                <MinusCircle className="w-4 h-4 mr-0.5" />
                OUTGOING
              </Button>
              <Button
                type="button"
                variant={transactionType === "incoming" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  transactionType === "incoming" 
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" 
                    : "hover:bg-muted hover:text-foreground"
                )}
                onClick={() => {
                  setTransactionType("incoming")
                  setSpendingAmount("")
                  setDisplaySpendingAmount("$")
                }}
              >
                <PlusCircle className="w-4 h-4 mr-0.5" />
                INCOMING
              </Button>
              <Button
                type="button"
                variant={transactionType === "transfer" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  transactionType === "transfer" 
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" 
                    : "hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setTransactionType("transfer")}
              >
                <ArrowRightLeft className="w-4 h-4 mr-0.5" />
                TRANSFER
              </Button>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="text"
                placeholder="$0.00"
                value={displayAmount}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9.]/g, "")
                  
                  // Handle empty input
                  if (value === "") {
                    setAmount("")
                    setDisplayAmount("$")
                    return
                  }
                  
                  // Prevent multiple decimal points
                  const parts = value.split(".")
                  if (parts.length > 2) {
                    value = parts[0] + "." + parts.slice(1).join("")
                  }
                  
                  // Limit to 2 decimal places
                  if (parts.length === 2 && parts[1].length > 2) {
                    value = parts[0] + "." + parts[1].slice(0, 2)
                  }
                  
                  setAmount(value)
                  
                  // Format with commas
                  const [integerPart, decimalPart] = value.split(".")
                  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                  const formatted = decimalPart !== undefined 
                    ? `$${formattedInteger}.${decimalPart}` 
                    : `$${formattedInteger}`
                  
                  setDisplayAmount(formatted)
                }}
                className="text-lg"
              />
            </div>

            {/* My Share (outgoing only) */}
            {transactionType === "outgoing" && (
              <div className="space-y-2">
                <Label htmlFor="spending-amount">My share</Label>
                <Input
                  id="spending-amount"
                  type="text"
                  placeholder="$0.00"
                  value={displaySpendingAmount}
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^0-9.]/g, "")
                    
                    if (value === "") {
                      setSpendingAmount("")
                      setDisplaySpendingAmount("$")
                      return
                    }
                    
                    const parts = value.split(".")
                    if (parts.length > 2) {
                      value = parts[0] + "." + parts.slice(1).join("")
                    }
                    if (parts.length === 2 && parts[1].length > 2) {
                      value = parts[0] + "." + parts[1].slice(0, 2)
                    }
                    
                    setSpendingAmount(value)
                    
                    const [integerPart, decimalPart] = value.split(".")
                    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                    const formatted = decimalPart !== undefined 
                      ? `$${formattedInteger}.${decimalPart}` 
                      : `$${formattedInteger}`
                    
                    setDisplaySpendingAmount(formatted)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Optional &mdash; leave blank to count the full amount as spending
                </p>
              </div>
            )}

            {/* Payroll Deductions (incoming only) */}
            {transactionType === "incoming" && (
              <div className="space-y-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setDeductionsOpen(!deductionsOpen)
                    if (!deductionsOpen && deductions.length === 0) addDeductionRow()
                  }}
                >
                  {deductionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Payroll Deductions
                  {deductions.length > 0 && (
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5">
                      {deductions.length}
                    </span>
                  )}
                </button>

                {deductionsOpen && (
                  <div className="space-y-3 rounded-lg border p-4">
                    {deductions.map((ded, index) => (
                      <div key={index} className="space-y-2">
                        {index > 0 && <div className="border-t" />}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Label</Label>
                            <Input
                              placeholder="e.g. RRSP, Income Tax, CPP, EI"
                              value={ded.label}
                              onChange={(e) => updateDeduction(index, "label", e.target.value)}
                            />
                          </div>
                          <div className="w-[140px] space-y-1">
                            <Label className="text-xs">Amount</Label>
                            <Input
                              placeholder="$0.00"
                              value={ded.displayAmount}
                              onChange={(e) => updateDeduction(index, "amount", e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-5 shrink-0"
                            onClick={() => removeDeductionRow(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Credit to Account (optional)</Label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={ded.targetAccountId}
                            onChange={(e) => updateDeduction(index, "targetAccountId", e.target.value)}
                          >
                            <option value="">None (e.g. taxes)</option>
                            {investmentAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id?.toString() ?? ""}>
                                {acc.account_name} ({acc.account_subtype})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={addDeductionRow}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add deduction
                    </Button>

                    {deductions.length > 0 && parseFloat(amount) > 0 && (
                      <div className="text-sm text-muted-foreground border-t pt-3 space-y-1">
                        <div className="flex justify-between">
                          <span>Deposit (net)</span>
                          <span>${parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Deductions</span>
                          <span>${deductionTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between font-medium text-foreground">
                          <span>Gross</span>
                          <span>${grossIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Merchant */}
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={merchantOpen}
                    className="w-full justify-between font-normal"
                  >
                    {merchant || "Search merchants..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search merchants..."
                      value={merchant}
                      onValueChange={setMerchant}
                    />
                    <CommandList>
                      {isCustomMerchant && (
                        <CommandItem
                          onSelect={() => {
                            // Persist the custom merchant to the database
                            addMerchant(merchant).catch(console.error)
                            setMerchantOpen(false)
                          }}
                        >
                          Add "{merchant}"
                        </CommandItem>
                      )}
                      <CommandEmpty>No merchant found.</CommandEmpty>
                      <CommandGroup>
                        {filteredMerchants.map((m) => (
                          <CommandItem
                            key={m}
                            value={m}
                            onSelect={(currentValue) => {
                              setMerchant(currentValue)
                              setMerchantOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                merchant === m ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {m}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-0.5 h-4 w-4" />
                    {date ? format(date, "MMMM dd, yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => {
                      if (newDate) {
                        setDate(normalizeCalendarDate(newDate))
                        setDateOpen(false)
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* From account / Account */}
            <div className="space-y-2">
              <Label htmlFor="account">{transactionType === "transfer" ? "From account" : "Account"}</Label>
              <Popover open={accountOpen} onOpenChange={setAccountOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedAccount ? (
                      selectedAccount.account_name
                    ) : (
                      transactionType === "transfer" ? "Select from account..." : "Select account..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search accounts..." />
                    <CommandList>
                      <CommandEmpty>
                        {accounts.length === 0 ? "No accounts found." : "No account found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {accounts.map((account) => (
                          <CommandItem
                            key={account.id}
                            value={account.account_name}
                            onSelect={() => {
                              setAccountTypeId(account.id?.toString() || "")
                              setAccountOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                accountTypeId === account.id?.toString() ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {account.account_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* To account (transfer only) */}
            {transactionType === "transfer" && (
              <div className="space-y-2">
                <Label>To account</Label>
                <Popover open={toAccountOpen} onOpenChange={setToAccountOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={toAccountOpen}
                      className="w-full justify-between font-normal"
                    >
                      {accounts.find((a) => a.id?.toString() === toAccountTypeId)?.account_name ?? "Select to account..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search accounts..." />
                      <CommandList>
                        <CommandEmpty>No account found.</CommandEmpty>
                        <CommandGroup>
                          {accounts
                            .filter((account) => account.id?.toString() !== accountTypeId)
                            .map((account) => (
                              <CommandItem
                                key={account.id}
                                value={account.account_name}
                                onSelect={() => {
                                  setToAccountTypeId(account.id?.toString() || "")
                                  setToAccountOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    toAccountTypeId === account.id?.toString() ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {account.account_name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {transactionType !== "transfer" && (
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedCategory ? (
                      <div className="flex items-center">
                        <span className="mr-2">{selectedCategory.emoji}</span>
                        <span>{selectedCategory.label}</span>
                      </div>
                    ) : (
                      "Search categories..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0 max-h-[800px]" side="right" align="start">
                  <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandList className="max-h-[750px]">
                      <CommandEmpty>No category found.</CommandEmpty>
                      {formattedCategories.map((group) => (
                        <CommandGroup key={group.group} heading={group.group}>
                          {group.items.map((item) => (
                            <CommandItem
                              key={item.value}
                              value={item.value}
                              onSelect={(currentValue) => {
                                setCategory(currentValue)
                                setCategoryOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  category === item.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="mr-2">{item.emoji}</span>
                              {item.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Add a note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button type="submit">
                Update transaction
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this transaction? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
