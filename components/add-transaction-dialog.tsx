"use client"

import * as React from "react"
import { useState, useMemo, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Check, ChevronsUpDown, MinusCircle, PlusCircle, ArrowRightLeft, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import type { Transaction } from "@/lib/types"
import { type Account } from "@/lib/accounts"
import { createTransaction } from "@/lib/transactions"
import { type Category } from "@/lib/categories"
import { useDataContext } from "@/app/data-context"
import { useComboboxSearch } from "@/hooks/use-combobox-search"
import { TransactionDateField, useTransactionDate } from "@/components/transaction-editor/date-field"
import { EditorFooter, submitOnShortcut, useEditorFocus } from "@/components/transaction-editor/editor-controls"
import { reconcileSavedTransaction } from "@/lib/ledger/saved-transaction"
import { PAYROLL_DEDUCTION_LABELS } from "@/lib/payroll-deductions"

export interface TransactionFormData {
  transaction_type: "outgoing" | "incoming" | "transfer"
  incoming_subtype?: "income" | "reimbursement" | null
  amount: number
  merchant: string
  date: Date
  account_type_id: string
  category: string
  notes?: string
  spending_amount?: number | null
  to_account_type_id?: string | null
  deductions?: { label: string; amount: number; target_account_id?: number | null }[]
}

interface AddTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTransactionCreated?: (data: Transaction) => void
  onAfterSave?: () => void
  accounts: Account[]
  categories: Category[]
  defaultDate?: Date
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  onTransactionCreated,
  onAfterSave,
  accounts,
  categories,
  defaultDate,
}: AddTransactionDialogProps) {
  const resolvedDefaultDate = useMemo(
    () => normalizeCalendarDate(defaultDate ?? new Date()),
    [defaultDate]
  )
  const [transactionType, setTransactionType] = useState<"outgoing" | "incoming" | "transfer">("outgoing")
  const [amount, setAmount] = useState("")
  const [displayAmount, setDisplayAmount] = useState("$")
  const [merchant, setMerchant] = useState("")
  const merchantCombobox = useComboboxSearch({ search: merchant, onSearchChange: setMerchant })
  const dateField = useTransactionDate(resolvedDefaultDate)
  const applyDate = dateField.apply
  const [accountTypeId, setAccountTypeId] = useState("")
  const accountCombobox = useComboboxSearch()
  const [toAccountTypeId, setToAccountTypeId] = useState("")
  const toAccountCombobox = useComboboxSearch()
  const [category, setCategory] = useState("")
  const categoryCombobox = useComboboxSearch()
  const [notes, setNotes] = useState("")
  const [spendingAmount, setSpendingAmount] = useState("")
  const [displaySpendingAmount, setDisplaySpendingAmount] = useState("$")
  const [deductionsOpen, setDeductionsOpen] = useState(false)
  const [deductions, setDeductions] = useState<{ label: string; amount: string; displayAmount: string; targetAccountId: string }[]>([])
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitting = React.useRef(false)
  const [saveError, setSaveError] = useState("")
  const editorFocus = useEditorFocus()
  const amountInputRef = useRef<HTMLInputElement>(null)
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

  const resetForm = () => {
    setTransactionType("outgoing")
    setAmount("")
    setDisplayAmount("$")
    setSpendingAmount("")
    setDisplaySpendingAmount("$")
    setMerchant("")
    applyDate(resolvedDefaultDate)
    setAccountTypeId("")
    setToAccountTypeId("")
    setCategory("")
    setNotes("")
    setDeductions([])
    setDeductionsOpen(false)
    setFormErrors({})
  }

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

  React.useEffect(() => {
    if (open) {
      applyDate(resolvedDefaultDate)
    }
  }, [applyDate, open, resolvedDefaultDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    const submittedDate = dateField.commit()
    if (!submittedDate) return
    setSaveError("")
    setFormErrors({})

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormErrors((prev) => ({ ...prev, amount: "Please enter a valid amount." }))
      amountInputRef.current?.focus()
      return
    }

    if (transactionType === "transfer") {
      if (!accountTypeId || !toAccountTypeId) {
        setFormErrors((prev) => ({ ...prev, account: "Please select both From and To accounts." }))
        return
      }
      if (accountTypeId === toAccountTypeId) {
        setFormErrors((prev) => ({ ...prev, toAccount: "From and To accounts must be different." }))
        return
      }
    } else if ((transactionType === "outgoing" || transactionType === "incoming") && !accountTypeId) {
      setFormErrors((prev) => ({ ...prev, account: "Please select an account." }))
      return
    }

    let parsedSpendingAmount: number | null = null
    if (transactionType === "outgoing" && spendingAmount !== "") {
      const num = parseFloat(spendingAmount)
      if (isNaN(num) || num < 0 || num > numAmount) {
        setFormErrors((prev) => ({ ...prev, spendingAmount: "My share must be between $0 and the total amount." }))
        return
      }
      parsedSpendingAmount = num
    }

    const parsedDeductions: { label: string; amount: number; target_account_id?: number | null }[] = []
    if (transactionType === "incoming" && deductions.length > 0) {
      for (let i = 0; i < deductions.length; i++) {
        const d = deductions[i]
        const dedAmount = parseFloat(d.amount)
        if (!d.label.trim()) {
          setFormErrors((prev) => ({ ...prev, [`deductionLabel-${i}`]: "Enter a label for this deduction." }))
          return
        }
        if (isNaN(dedAmount) || dedAmount <= 0) {
          setFormErrors((prev) => ({ ...prev, [`deductionAmount-${i}`]: "Enter a valid amount." }))
          return
        }
        parsedDeductions.push({
          label: d.label.trim(),
          amount: dedAmount,
          target_account_id: d.targetAccountId ? parseInt(d.targetAccountId, 10) : null,
        })
      }
    }

    const merchantValue = (transactionType === "transfer" ? (merchant || "Transfer") : merchant).trim()

    const savedData: TransactionFormData = {
      transaction_type: transactionType,
      incoming_subtype:
        transactionType === "incoming"
          ? getDefaultIncomingSubtypeForCategory(category)
          : null,
      amount: numAmount,
      merchant: merchantValue,
      date: submittedDate,
      account_type_id: accountTypeId,
      category: transactionType === "transfer" ? (category || "transfer") : category,
      notes,
      spending_amount: transactionType === "outgoing" ? parsedSpendingAmount : undefined,
      deductions: parsedDeductions.length > 0 ? parsedDeductions : undefined,
    }
    if (transactionType === "transfer") {
      savedData.to_account_type_id = toAccountTypeId
    }

    const shouldPersistMerchant =
      transactionType !== "transfer" &&
      merchantValue.length > 0 &&
      !merchantNames.some((m) => m.toLowerCase() === merchantValue.toLowerCase())

    const transactionData: Parameters<typeof createTransaction>[0] = {
      ...savedData,
      date: toLocalDateString(submittedDate),
    }

    submitting.current = true
    setIsSubmitting(true)
    try {
      if (shouldPersistMerchant) {
        await addMerchant(merchantValue)
      }
      const result = await createTransaction(transactionData)
      onTransactionCreated?.(reconcileSavedTransaction({ ...savedData, affects_balance: true, source_type: "manual" }, result))
      toast.success("Transaction saved")
      const another = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another"
      resetForm()
      if (another) {
        // Carry only context, never amounts, merchant, notes, shares, or deductions.
        setTransactionType(transactionType)
        setAccountTypeId(accountTypeId)
        applyDate(submittedDate)
        requestAnimationFrame(() => amountInputRef.current?.focus())
      } else {
        onOpenChange(false)
      }
      onAfterSave?.()
    } catch (error) {
      setSaveError("Could not save. Your draft is intact; please try again.")
      console.error("Failed to create transaction:", error)
      toast.error("Failed to create transaction. Please try again.", {
        duration: 5000,
        position: "top-right",
      })
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  const filteredMerchants = useMemo(
    () => merchantNames.filter((m) => m.toLowerCase().includes(merchant.toLowerCase())),
    [merchantNames, merchant]
  )

  // Check if the current merchant is custom (not in the saved list)
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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting.current) onOpenChange(next) }}>
      <DialogContent {...editorFocus} className="sm:max-w-[600px] max-h-[90dvh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Keep your ledger up to date. All amounts are in dollars.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          onKeyDown={submitOnShortcut}
        >
          <fieldset disabled={isSubmitting} className="min-w-0 space-y-5">
          {/* Transaction Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={transactionType === "outgoing" ? "default" : "outline"}
              className={cn(
                "min-w-0 flex-1 px-2 text-xs sm:text-sm",
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
                "min-w-0 flex-1 px-2 text-xs sm:text-sm",
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
                "min-w-0 flex-1 px-2 text-xs sm:text-sm",
                transactionType === "transfer" 
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" 
                  : "hover:bg-muted hover:text-foreground"
              )}
              onClick={() => {
                setTransactionType("transfer")
              }}
            >
              <ArrowRightLeft className="w-4 h-4 mr-0.5" />
              TRANSFER
            </Button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              ref={amountInputRef}
              id="amount"
              type="text"
              placeholder="$0.00"
              value={displayAmount}
              aria-invalid={!!formErrors.amount}
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
            {formErrors.amount ? <p className="text-sm text-destructive">{formErrors.amount}</p> : null}
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
              {formErrors.spendingAmount ? <p className="text-sm text-destructive">{formErrors.spendingAmount}</p> : null}
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
                tabIndex={0}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setDeductionsOpen(!deductionsOpen)
                  if (!deductionsOpen && deductions.length === 0) addDeductionRow()
                }}
              >
                {deductionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Payroll Deductions
                {deductions.length > 0 ? (
                  <span className="text-xs bg-muted rounded-full px-2 py-0.5">
                    {deductions.length}
                  </span>
                ) : null}
              </button>

              {deductionsOpen && (
                <div className="space-y-3 rounded-lg border p-4">
                  {deductions.map((ded, index) => (
                    <div key={index} className="space-y-2">
                      {index > 0 && <div className="border-t" />}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Label</Label>
                          <Select
                            value={ded.label}
                            onValueChange={(value) => updateDeduction(index, "label", value)}
                          >
                            <SelectTrigger
                              className="h-10 rounded-md px-3 py-2 text-sm"
                              aria-invalid={!!formErrors[`deductionLabel-${index}`]}
                            >
                              <SelectValue placeholder="Select deduction" />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYROLL_DEDUCTION_LABELS.map((label) => (
                                <SelectItem key={label} value={label}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {formErrors[`deductionLabel-${index}`] ? <p className="text-xs text-destructive">{formErrors[`deductionLabel-${index}`]}</p> : null}
                        </div>
                        <div className="w-[140px] space-y-1">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            placeholder="$0.00"
                            value={ded.displayAmount}
                            onChange={(e) => updateDeduction(index, "amount", e.target.value)}
                            aria-invalid={!!formErrors[`deductionAmount-${index}`]}
                          />
                          {formErrors[`deductionAmount-${index}`] ? <p className="text-xs text-destructive">{formErrors[`deductionAmount-${index}`]}</p> : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-5 shrink-0"
                          onClick={() => removeDeductionRow(index)}
                          aria-label="Remove deduction"
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

                  {deductions.length > 0 && Number.isFinite(parseFloat(amount)) && parseFloat(amount) > 0 ? (
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
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Merchant */}
          <div className="space-y-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Popover open={merchantCombobox.open} onOpenChange={merchantCombobox.setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="merchant"
                  variant="outline"
                  role="combobox"
                  aria-expanded={merchantCombobox.open}
                  onKeyDown={merchantCombobox.onTriggerKeyDown}
                  className="w-full justify-between font-normal"
                >
                  {merchant || "Search merchants…"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent onOpenAutoFocus={merchantCombobox.onOpenAutoFocus} className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                  <CommandInput
                    ref={merchantCombobox.inputRef}
                    placeholder="Search merchants…"
                    value={merchant}
                    onValueChange={setMerchant}
                  />
                  <CommandList>
                    {isCustomMerchant && (
                      <CommandItem
                        onSelect={() => {
                          merchantCombobox.setOpen(false)
                        }}
                      >
                        Add &quot;{merchant}&quot;
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
                            merchantCombobox.setOpen(false)
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

          <TransactionDateField value={dateField} />

          {/* From account / Account */}
          <div className="space-y-2">
            <Label htmlFor="account">{transactionType === "transfer" ? "From account" : "Account"}</Label>
            <Popover open={accountCombobox.open} onOpenChange={accountCombobox.setOpen}>
              <PopoverTrigger asChild>
                <Button
                    type="button"
                    id="account"
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountCombobox.open}
                    onKeyDown={accountCombobox.onTriggerKeyDown}
                    className="w-full justify-between font-normal"
                  >
                    {selectedAccount ? (
                      selectedAccount.account_name
                    ) : (
                      transactionType === "transfer" ? "Select from account…" : "Select account…"
                    )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent onOpenAutoFocus={accountCombobox.onOpenAutoFocus} className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                  <CommandInput
                    ref={accountCombobox.inputRef}
                    placeholder="Search accounts…"
                    value={accountCombobox.search}
                    onValueChange={accountCombobox.setSearch}
                  />
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
                            accountCombobox.setOpen(false)
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
            {formErrors.account ? <p className="text-sm text-destructive">{formErrors.account}</p> : null}
          </div>

          {/* To account (transfer only) */}
          {transactionType === "transfer" ? (
            <div className="space-y-2">
              <Label htmlFor="to-account">To account</Label>
              <Popover open={toAccountCombobox.open} onOpenChange={toAccountCombobox.setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    id="to-account"
                    variant="outline"
                    role="combobox"
                    aria-expanded={toAccountCombobox.open}
                    onKeyDown={toAccountCombobox.onTriggerKeyDown}
                    className="w-full justify-between font-normal"
                  >
                    {accounts.find((a) => a.id?.toString() === toAccountTypeId)?.account_name ?? "Select to account…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent onOpenAutoFocus={toAccountCombobox.onOpenAutoFocus} className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput
                      ref={toAccountCombobox.inputRef}
                      placeholder="Search accounts…"
                      value={toAccountCombobox.search}
                      onValueChange={toAccountCombobox.setSearch}
                    />
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
                                toAccountCombobox.setOpen(false)
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
              {formErrors.toAccount ? <p className="text-sm text-destructive">{formErrors.toAccount}</p> : null}
            </div>
          ) : null}

          {/* Category (hidden for transfer, optional elsewhere) */}
          {transactionType !== "transfer" ? (
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Popover open={categoryCombobox.open} onOpenChange={categoryCombobox.setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="category"
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryCombobox.open}
                  onKeyDown={categoryCombobox.onTriggerKeyDown}
                  className="w-full justify-between font-normal"
                >
                  {selectedCategory ? (
                    <div className="flex items-center">
                      <span className="mr-2">{selectedCategory.emoji}</span>
                      <span>{selectedCategory.label}</span>
                    </div>
                  ) : (
                    "Search categories…"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent onOpenAutoFocus={categoryCombobox.onOpenAutoFocus} className="w-(--radix-popover-trigger-width) p-0 max-h-[800px]" side="right" align="start">
                <Command>
                  <CommandInput
                    ref={categoryCombobox.inputRef}
                    placeholder="Search categories…"
                    value={categoryCombobox.search}
                    onValueChange={categoryCombobox.setSearch}
                  />
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
                              categoryCombobox.setOpen(false)
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
          ) : null}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Add a note…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          </fieldset>
          <EditorFooter pending={isSubmitting} error={saveError} create />
        </form>
      </DialogContent>
    </Dialog>
  )
}
