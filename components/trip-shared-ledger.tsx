"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  ReceiptText,
  TableProperties,
  Trash2,
  WalletCards,
} from "lucide-react"

import { type Account } from "@/lib/accounts"
import { type Category } from "@/lib/categories"
import {
  type TripImportBatch,
  type TripImportDraftTransaction,
  type TripSharedEntry,
  type TripSharedLedgerSummary,
} from "@/lib/types"
import { parseSplitwiseCsv, type SplitwiseParseResult } from "@/lib/splitwise"
import {
  createManualSharedExpense,
  importSplitwiseCsv,
} from "@/lib/trip-shared-ledger"
import { categoryNameToValue, findCategoryByValue, toLocalDateString } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface TripSharedLedgerProps {
  tripId: string
  accounts: Account[]
  categories: Category[]
  entries: TripSharedEntry[]
  batches: TripImportBatch[]
  summary: TripSharedLedgerSummary
  onAfterChange: () => Promise<void>
}

type TabKey = "overview" | "ledger" | "reconcile"
type DraftGroupKey = TripImportDraftTransaction["kind"]

function formatCurrency(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function accountOptions(accounts: Account[]) {
  return accounts.filter((account) => account.id != null)
}

function defaultCategoryFor(splitwiseCategory: string, categories: Category[]) {
  const normalized = categoryNameToValue(splitwiseCategory)
  const exact = categories.find((category) => categoryNameToValue(category.name) === normalized)
  if (exact) return normalized

  const lower = splitwiseCategory.toLowerCase()
  if (lower.includes("dining") || lower.includes("grocer")) return "restaurants"
  if (lower.includes("phone") || lower.includes("internet")) return "telecom"
  return "travel"
}

function buildDraftTransactions(
  preview: SplitwiseParseResult,
  categoryMap: Record<string, string>,
  expenseAccountId: string,
  paymentAccountId: string
): TripImportDraftTransaction[] {
  const drafts: TripImportDraftTransaction[] = []

  for (const row of preview.rows) {
    if (row.postingStatus === "ignored" || row.selfShare <= 0) continue

    const category = categoryMap[row.splitwiseCategory] ?? row.grovCategory
    const base = {
      include: true,
      rowIndex: row.rowIndex,
      date: row.date,
      merchant: row.description,
      category,
      amount: row.selfShare,
      spendingAmount: row.selfShare,
      notes: `Trip shared ledger: ${row.payerNames.join(", ") || "Splitwise"}`,
      sourceRow: row.rawRow,
    }

    if (row.entryKind === "expense" && row.selfNet > 0) {
      drafts.push({
        ...base,
        kind: "you_paid" as const,
        accountId: expenseAccountId,
        amount: row.cost,
        affectsBalance: true,
        transactionType: "outgoing" as const,
        incomingSubtype: null,
      })
      continue
    }

    if (row.entryKind === "expense" && row.selfNet < 0) {
      drafts.push({
        ...base,
        kind: "friend_paid" as const,
        accountId: null,
        amount: row.cost,
        affectsBalance: false,
        transactionType: "outgoing" as const,
        incomingSubtype: null,
      })
      continue
    }

    if (row.entryKind === "payment") {
      drafts.push({
        ...base,
        kind: "payment" as const,
        accountId: paymentAccountId,
        category: "expense-reimbursement",
        spendingAmount: null,
        affectsBalance: true,
        transactionType: row.paymentDirection === "sent" ? "outgoing" as const : "incoming" as const,
        incomingSubtype: row.paymentDirection === "sent" ? null : "reimbursement" as const,
      })
    }
  }

  return drafts
}

function draftGroupLabel(kind: DraftGroupKey) {
  if (kind === "you_paid") return "You paid"
  if (kind === "friend_paid") return "Friends paid"
  return "Payments"
}

function draftIssue(draft: TripImportDraftTransaction): string | null {
  if (!draft.include) return null
  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return "Invalid date"
  if (!draft.merchant.trim()) return "Missing merchant"
  if (!draft.category.trim()) return "Missing category"
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) return "Invalid amount"
  if (
    draft.kind !== "payment" &&
    (typeof draft.spendingAmount !== "number" ||
      !Number.isFinite(draft.spendingAmount) ||
      draft.spendingAmount <= 0)
  ) {
    return "Invalid my share"
  }
  if (draft.affectsBalance && !draft.accountId) return "Missing account"
  if (
    draft.transactionType === "outgoing" &&
    draft.spendingAmount != null &&
    (draft.spendingAmount < 0 || draft.spendingAmount > draft.amount)
  ) {
    return "My share is invalid"
  }
  return null
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  compact = false,
}: {
  label: string
  value: string
  icon: typeof ReceiptText
  tone?: string
  compact?: boolean
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border bg-background", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("min-w-0 font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          {label}
        </p>
        <Icon className={cn("h-4 w-4 text-muted-foreground", tone)} />
      </div>
      <div className="mt-2">
        <p
          className={cn(
            "truncate font-semibold tabular-nums",
            compact ? "text-xl" : "text-2xl"
          )}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

export function TripSharedLedger({
  tripId,
  accounts,
  categories,
  entries,
  batches,
  summary,
  onAfterChange,
}: TripSharedLedgerProps) {
  const [activeTab, setActiveTab] = React.useState<TabKey>("overview")
  const [importOpen, setImportOpen] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Shared ledger</CardTitle>
              {summary.settled ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Settled
                </span>
              ) : entries.length > 0 ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Needs review
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Import Splitwise exports or add shared expenses without creating visible clearing accounts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Add shared expense
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
              Import Splitwise CSV
            </Button>
          </div>
        </div>

        <div className="flex w-full overflow-x-auto rounded-lg border bg-muted/20 p-1">
          {[
            ["overview", "Overview"],
            ["ledger", "Ledger"],
            ["reconcile", "Reconcile"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "min-w-28 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab(value as TabKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {activeTab === "overview" ? (
          <SharedLedgerOverview summary={summary} />
        ) : activeTab === "ledger" ? (
          <SharedLedgerTable entries={entries} categories={categories} summary={summary} />
        ) : (
          <SharedLedgerReconcile batches={batches} summary={summary} />
        )}
      </CardContent>

      <ImportSplitwiseDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        tripId={tripId}
        accounts={accounts}
        categories={categories}
        onImported={async () => {
          await onAfterChange()
          setActiveTab("reconcile")
        }}
      />
      <ManualSharedExpenseDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        tripId={tripId}
        accounts={accounts}
        categories={categories}
        onCreated={async () => {
          await onAfterChange()
          setActiveTab("ledger")
        }}
      />
    </Card>
  )
}

function SharedLedgerOverview({ summary }: { summary: TripSharedLedgerSummary }) {
  const currency = summary.currency ?? "CAD"
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="My trip cost"
          value={formatCurrency(summary.myTripSpend, currency)}
          icon={ReceiptText}
        />
        <StatTile
          label="Paid by me"
          value={formatCurrency(summary.paidByMe, currency)}
          icon={WalletCards}
        />
        <StatTile
          label="Paid by others for me"
          value={formatCurrency(summary.paidByOthersForMe, currency)}
          icon={TableProperties}
        />
        <StatTile
          label="Reimbursements"
          value={formatCurrency(summary.reimbursements, currency)}
          icon={CheckCircle2}
          tone="text-emerald-600"
        />
      </div>
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Splitwise settlement balance</p>
            <p className="text-sm text-muted-foreground">
              Zero means the imported participant ledger is fully settled.
            </p>
          </div>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              Math.abs(summary.netBalance) < 0.005 ? "text-emerald-700" : "text-amber-700"
            )}
          >
            {formatCurrency(summary.netBalance, currency)}
          </p>
        </div>
      </div>
    </div>
  )
}

function SharedLedgerTable({
  entries,
  categories,
  summary,
}: {
  entries: TripSharedEntry[]
  categories: Category[]
  summary: TripSharedLedgerSummary
}) {
  const currency = summary.currency ?? "CAD"
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No shared ledger entries yet. Import a Splitwise CSV or add one manually.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Description</th>
            <th className="py-2 pr-4 font-medium">Payer</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 text-right font-medium">Total</th>
            <th className="py-2 pr-4 text-right font-medium">My share</th>
            <th className="py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const category = findCategoryByValue(categories, entry.grov_category)
            return (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-muted-foreground">
                  {toLocalDateString(entry.date)}
                </td>
                <td className="max-w-[260px] py-3 pr-4">
                  <p className="truncate font-medium">{entry.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.entry_kind === "payment" ? "Settlement payment" : entry.splitwise_category}
                  </p>
                </td>
                <td className="max-w-[180px] py-3 pr-4 text-muted-foreground">
                  <span className="truncate">{entry.payer_names.join(", ") || "Unknown"}</span>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {category ? `${category.emoji} ${category.label}` : entry.grov_category}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {formatCurrency(entry.total_cost, entry.currency || currency)}
                </td>
                <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                  {formatCurrency(entry.self_share, entry.currency || currency)}
                </td>
                <td className="py-3 text-right">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      entry.posting_status === "posted"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {entry.posting_status === "posted" ? "Posted" : "Ignored"}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SharedLedgerReconcile({
  batches,
  summary,
}: {
  batches: TripImportBatch[]
  summary: TripSharedLedgerSummary
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Imported rows" value={summary.importedRows.toLocaleString("en-US")} icon={FileUp} />
        <StatTile label="Expense rows" value={summary.expenseRows.toLocaleString("en-US")} icon={ReceiptText} />
        <StatTile label="Payment rows" value={summary.paymentRows.toLocaleString("en-US")} icon={WalletCards} />
      </div>
      <div className="rounded-lg border">
        {batches.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No import batches yet.</p>
        ) : (
          <div className="divide-y">
            {batches.map((batch) => (
              <div key={batch.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{batch.file_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Self: {batch.self_participant} · {batch.row_count} rows · {batch.currency ?? "mixed currency"}
                  </p>
                </div>
                <span
                  className={cn(
                    "w-fit rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                    batch.status === "settled"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  )}
                >
                  {batch.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ImportSplitwiseDialog({
  open,
  onOpenChange,
  tripId,
  accounts,
  categories,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  accounts: Account[]
  categories: Category[]
  onImported: () => Promise<void>
}) {
  const [fileName, setFileName] = React.useState("")
  const [csvText, setCsvText] = React.useState("")
  const [selfParticipant, setSelfParticipant] = React.useState("")
  const [preview, setPreview] = React.useState<SplitwiseParseResult | null>(null)
  const [expenseAccountId, setExpenseAccountId] = React.useState("")
  const [paymentAccountId, setPaymentAccountId] = React.useState("")
  const [categoryMap, setCategoryMap] = React.useState<Record<string, string>>({})
  const [drafts, setDrafts] = React.useState<TripImportDraftTransaction[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [fileInputKey, setFileInputKey] = React.useState(0)

  const resetImportState = React.useCallback(() => {
    setFileName("")
    setCsvText("")
    setSelfParticipant("")
    setPreview(null)
    setCategoryMap({})
    setDrafts([])
    setSubmitting(false)
    setFileInputKey((current) => current + 1)
  }, [])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (submitting && !nextOpen) return
    if (!nextOpen) {
      resetImportState()
    }
    onOpenChange(nextOpen)
  }, [onOpenChange, resetImportState, submitting])

  React.useEffect(() => {
    if (!open) return
    const firstAccount = accountOptions(accounts)[0]?.id?.toString() ?? ""
    setExpenseAccountId((current) => current || firstAccount)
    setPaymentAccountId((current) => current || firstAccount)
  }, [accounts, open])

  const splitwiseCategories = React.useMemo(() => {
    if (!preview) return []
    return Array.from(
      new Set(
        preview.rows
          .filter((row) => row.entryKind === "expense")
          .map((row) => row.splitwiseCategory)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [preview])

  const parsePreview = React.useCallback((text: string, participant?: string) => {
    const parsed = parseSplitwiseCsv(text, {
      selfParticipant: participant || undefined,
      categoryMap,
    })
    setPreview(parsed)
    setSelfParticipant(participant || parsed.suggestedSelfParticipant || "")
    const nextMap: Record<string, string> = {}
    for (const row of parsed.rows) {
      if (row.entryKind !== "expense") continue
      nextMap[row.splitwiseCategory] =
        categoryMap[row.splitwiseCategory] ?? defaultCategoryFor(row.splitwiseCategory, categories)
    }
    setCategoryMap(nextMap)
    setDrafts(buildDraftTransactions(parsed, nextMap, expenseAccountId, paymentAccountId))
  }, [categories, categoryMap, expenseAccountId, paymentAccountId])

  const handleFile = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      setFileName(file.name)
      setCsvText(text)
      parsePreview(text)
    } catch (error) {
      console.error("Failed to parse CSV:", error)
      toast.error(error instanceof Error ? error.message : "Failed to parse CSV")
    }
  }

  const handleSelfChange = (value: string) => {
    setSelfParticipant(value)
    try {
      parsePreview(csvText, value)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to parse CSV")
    }
  }

  const updateDraft = React.useCallback((
    rowIndex: number,
    patch: Partial<TripImportDraftTransaction>
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.rowIndex === rowIndex ? { ...draft, ...patch } : draft
      )
    )
  }, [])

  const updateGroup = React.useCallback((
    kind: DraftGroupKey,
    patch: Partial<TripImportDraftTransaction>
  ) => {
    setDrafts((current) =>
      current.map((draft) => draft.kind === kind ? { ...draft, ...patch } : draft)
    )
  }, [])

  const handleExpenseAccountChange = (value: string) => {
    setExpenseAccountId(value)
    updateGroup("you_paid", { accountId: value })
  }

  const handlePaymentAccountChange = (value: string) => {
    setPaymentAccountId(value)
    updateGroup("payment", { accountId: value })
  }

  const handleCategoryMapChange = (splitwiseCategory: string, value: string) => {
    setCategoryMap((prev) => ({
      ...prev,
      [splitwiseCategory]: value,
    }))
    const affectedRows = preview?.rows
      .filter((row) => row.splitwiseCategory === splitwiseCategory)
      .map((row) => row.rowIndex) ?? []
    setDrafts((current) =>
      current.map((draft) =>
        affectedRows.includes(draft.rowIndex) ? { ...draft, category: value } : draft
      )
    )
  }

  const selectedDrafts = drafts.filter((draft) => draft.include)
  const selectedTripSpend = selectedDrafts
    .filter((draft) => draft.kind !== "payment")
    .reduce((sum, draft) => sum + (draft.spendingAmount ?? draft.amount), 0)
  const selectedReimbursements = selectedDrafts
    .filter((draft) => draft.kind === "payment")
    .reduce((sum, draft) => sum + draft.amount, 0)
  const validationIssues = selectedDrafts
    .map((draft) => draftIssue(draft))
    .filter(Boolean)

  const canSubmit = Boolean(
    preview &&
    selfParticipant &&
    expenseAccountId &&
    paymentAccountId &&
    selectedDrafts.length > 0 &&
    validationIssues.length === 0
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[94vh] !w-[96vw] !max-w-[1600px] flex-col overflow-hidden"
        showCloseButton={!submitting}
        aria-busy={submitting}
      >
        <DialogHeader>
          <DialogTitle>Import Splitwise CSV</DialogTitle>
        </DialogHeader>

        <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto pr-1", submitting && "pointer-events-none select-none opacity-60")}>
          <div className="space-y-2">
            <Label htmlFor="splitwise-csv">CSV file</Label>
            <label
              htmlFor="splitwise-csv"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
                preview
                  ? "border-border bg-background"
                  : "border-dashed bg-muted/20 hover:bg-muted/35"
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileUp className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {fileName || "Choose a Splitwise CSV"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {fileName
                    ? "Parsed and ready for review before posting."
                    : "Upload an export to generate editable draft transactions."}
                </span>
              </span>
              <span className="shrink-0 rounded-md border bg-background px-3 py-1.5 text-sm font-medium">
                Browse
              </span>
            </label>
            <Input
              key={fileInputKey}
              id="splitwise-csv"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={submitting}
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {preview ? (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>You are</Label>
                  <select
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={selfParticipant}
                    disabled={submitting}
                    onChange={(event) => handleSelfChange(event.target.value)}
                  >
                    {preview.participants.map((participant) => (
                      <option key={participant} value={participant}>
                        {participant}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Account for expenses you paid</Label>
                  <select
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={expenseAccountId}
                    disabled={submitting}
                    onChange={(event) => handleExpenseAccountChange(event.target.value)}
                  >
                    {accountOptions(accounts).map((account) => (
                      <option key={account.id} value={account.id?.toString()}>
                        {account.account_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Account for settlements</Label>
                  <select
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={paymentAccountId}
                    disabled={submitting}
                    onChange={(event) => handlePaymentAccountChange(event.target.value)}
                  >
                    {accountOptions(accounts).map((account) => (
                      <option key={account.id} value={account.id?.toString()}>
                        {account.account_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatTile compact label="Rows" value={preview.summary.rowCount.toLocaleString("en-US")} icon={FileUp} />
                <StatTile compact label="Expenses" value={preview.summary.expenseCount.toLocaleString("en-US")} icon={ReceiptText} />
                <StatTile compact label="Payments" value={preview.summary.paymentCount.toLocaleString("en-US")} icon={WalletCards} />
                <StatTile
                  compact
                  label="My trip cost"
                  value={formatCurrency(preview.summary.totalSelfShare, preview.currencies[0] ?? "CAD")}
                  icon={CheckCircle2}
                />
              </div>

              <div className="space-y-2">
                <Label>Category mapping</Label>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                  {splitwiseCategories.map((splitwiseCategory) => (
                    <div key={splitwiseCategory} className="grid grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] items-center gap-3 rounded-md border p-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground" title={splitwiseCategory}>
                        {splitwiseCategory}
                      </span>
                      <select
                        className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                        value={categoryMap[splitwiseCategory] ?? "travel"}
                        disabled={submitting}
                        onChange={(event) =>
                          handleCategoryMapChange(splitwiseCategory, event.target.value)
                        }
                      >
                        {categories.map((category) => {
                          const value = categoryNameToValue(category.name)
                          return (
                            <option key={category.id ?? category.name} value={value}>
                              {category.name}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <DraftReview
                drafts={drafts}
                accounts={accounts}
                categories={categories}
                currency={preview.currencies[0] ?? "CAD"}
                onUpdateDraft={updateDraft}
                onUpdateGroup={updateGroup}
                disabled={submitting}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <p className="text-sm font-medium">No CSV selected yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Once you choose a file, Grov will show the exact transactions it plans to create so you can edit or remove them first.
              </p>
            </div>
          )}

          {preview ? (
            <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 border-t bg-background px-1 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedDrafts.length.toLocaleString("en-US")} selected
                </span>
                <span className="text-muted-foreground">·</span>
                {formatCurrency(selectedTripSpend, preview.currencies[0] ?? "CAD")} trip spend
                <span className="text-muted-foreground">·</span>
                {formatCurrency(selectedReimbursements, preview.currencies[0] ?? "CAD")} reimbursements
                {validationIssues.length > 0 ? (
                  <span className="text-destructive">
                    {validationIssues.length} issue{validationIssues.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  disabled={!canSubmit || submitting}
                  onClick={async () => {
                    if (!preview) return
                    setSubmitting(true)
                    try {
                      await importSplitwiseCsv({
                        tripId,
                        fileName: fileName || "Splitwise export.csv",
                        csvText,
                        selfParticipant,
                        expenseAccountId,
                        paymentAccountId,
                        categoryMap,
                        draftTransactions: drafts,
                      })
                      toast.success("Splitwise import posted")
                      setSubmitting(false)
                      resetImportState()
                      onOpenChange(false)
                      await onImported()
                    } catch (error) {
                      console.error("Failed to import Splitwise CSV:", error)
                      toast.error(error instanceof Error ? error.message : "Failed to import CSV")
                    } finally {
                      setSubmitting(false)
                    }
                  }}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  <span className="whitespace-nowrap">
                    {submitting ? "Posting..." : "Post selected transactions"}
                  </span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        {submitting ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm">
            <div
              className="flex max-w-sm flex-col items-center rounded-xl border bg-background p-6 text-center shadow-lg"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="mt-3 font-medium">Posting transactions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Creating ledger entries and transactions. Keep this dialog open for a moment.
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DraftReview({
  drafts,
  accounts,
  categories,
  currency,
  onUpdateDraft,
  onUpdateGroup,
  disabled = false,
}: {
  drafts: TripImportDraftTransaction[]
  accounts: Account[]
  categories: Category[]
  currency: string
  onUpdateDraft: (rowIndex: number, patch: Partial<TripImportDraftTransaction>) => void
  onUpdateGroup: (kind: DraftGroupKey, patch: Partial<TripImportDraftTransaction>) => void
  disabled?: boolean
}) {
  const [openGroups, setOpenGroups] = React.useState<Record<DraftGroupKey, boolean>>({
    you_paid: true,
    friend_paid: true,
    payment: true,
  })
  const includedDrafts = drafts.filter((draft) => draft.include)

  if (includedDrafts.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        No transactions selected for import.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Review transactions</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit or remove the transactions Grov will create before anything is posted.
        </p>
      </div>

      {(["you_paid", "friend_paid", "payment"] as DraftGroupKey[]).map((kind) => {
        const groupDrafts = includedDrafts.filter((draft) => draft.kind === kind)
        if (groupDrafts.length === 0) return null
        const subtotal = groupDrafts.reduce(
          (sum, draft) => sum + (draft.kind === "payment" ? draft.amount : draft.spendingAmount ?? draft.amount),
          0
        )
        const isOpen = openGroups[kind]
        return (
          <section key={kind} className="overflow-hidden rounded-lg border">
            <header className="flex flex-col gap-3 border-b bg-muted/30 p-3 lg:flex-row lg:items-center lg:justify-between">
              <button
                type="button"
                className="flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                onClick={() => setOpenGroups((prev) => ({ ...prev, [kind]: !prev[kind] }))}
              >
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="font-medium">{draftGroupLabel(kind)}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {groupDrafts.length}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(subtotal, currency)}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {kind !== "payment" ? (
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    disabled={disabled}
                    onChange={(event) => {
                      if (!event.target.value) return
                      onUpdateGroup(kind, { category: event.target.value })
                      event.currentTarget.value = ""
                    }}
                  >
                    <option value="">Set category</option>
                    {categories.map((category) => (
                      <option key={category.id ?? category.name} value={categoryNameToValue(category.name)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {kind !== "friend_paid" ? (
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    disabled={disabled}
                    onChange={(event) => {
                      if (!event.target.value) return
                      onUpdateGroup(kind, { accountId: event.target.value })
                      event.currentTarget.value = ""
                    }}
                  >
                    <option value="">Set account</option>
                    {accountOptions(accounts).map((account) => (
                      <option key={account.id} value={account.id?.toString()}>
                        {account.account_name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={disabled}
                  onClick={() => onUpdateGroup(kind, { include: false })}
                >
                  Remove all
                </Button>
              </div>
            </header>

            {isOpen ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[1280px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Merchant</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium">Account</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-right font-medium">My share</th>
                        <th className="px-3 py-2 font-medium">Notes</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupDrafts.map((draft) => (
                        <DraftReviewRow
                          key={draft.rowIndex}
                          draft={draft}
                          accounts={accounts}
                          categories={categories}
                          onUpdateDraft={onUpdateDraft}
                          compact={false}
                          disabled={disabled}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 p-2 lg:hidden">
                  {groupDrafts.map((draft) => (
                    <DraftReviewCard
                      key={draft.rowIndex}
                      draft={draft}
                      accounts={accounts}
                      categories={categories}
                      onUpdateDraft={onUpdateDraft}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function DraftReviewRow({
  draft,
  accounts,
  categories,
  onUpdateDraft,
  disabled = false,
}: {
  draft: TripImportDraftTransaction
  accounts: Account[]
  categories: Category[]
  onUpdateDraft: (rowIndex: number, patch: Partial<TripImportDraftTransaction>) => void
  compact: boolean
  disabled?: boolean
}) {
  const issue = draftIssue(draft)
  return (
    <tr className={cn("border-b last:border-0", issue && "bg-destructive/5")}>
      <td className="px-3 py-2 align-top">
        <Input
          className="h-8 w-32"
          value={draft.date}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { date: event.target.value })}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          className="h-8 min-w-64"
          value={draft.merchant}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { merchant: event.target.value })}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <select
          className="h-8 min-w-44 rounded-md border border-input bg-background px-2 text-sm"
          value={draft.category}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { category: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category.id ?? category.name} value={categoryNameToValue(category.name)}>
              {category.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        {draft.kind === "friend_paid" ? (
          <span className="inline-flex h-8 items-center text-xs text-muted-foreground">Paid by friend</span>
        ) : (
          <select
            className="h-8 min-w-52 rounded-md border border-input bg-background px-2 text-sm"
            value={draft.accountId ?? ""}
            disabled={disabled}
            onChange={(event) => onUpdateDraft(draft.rowIndex, { accountId: event.target.value })}
          >
            <option value="">Select account</option>
            {accountOptions(accounts).map((account) => (
              <option key={account.id} value={account.id?.toString()}>
                {account.account_name}
              </option>
            ))}
          </select>
        )}
        {issue ? <p className="mt-1 text-xs text-destructive">{issue}</p> : null}
      </td>
      <td className="px-3 py-2 text-right align-top">
        <Input
          className="ml-auto h-8 w-28 text-right"
          value={String(draft.amount)}
          disabled={disabled}
          onChange={(event) => {
            const amount = Number(event.target.value.replace(/[^0-9.]/g, ""))
            onUpdateDraft(draft.rowIndex, { amount })
          }}
        />
      </td>
      <td className="px-3 py-2 text-right align-top">
        {draft.kind === "payment" ? (
          <span className="inline-flex h-8 items-center text-xs text-muted-foreground">-</span>
        ) : (
          <Input
            className="ml-auto h-8 w-28 text-right"
            value={String(draft.spendingAmount ?? draft.amount)}
            disabled={disabled}
            onChange={(event) => {
              const spendingAmount = Number(event.target.value.replace(/[^0-9.]/g, ""))
              onUpdateDraft(draft.rowIndex, { spendingAmount })
            }}
          />
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          className="h-8 min-w-64"
          value={draft.notes ?? ""}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { notes: event.target.value })}
        />
      </td>
      <td className="px-3 py-2 text-right align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={disabled}
          onClick={() => onUpdateDraft(draft.rowIndex, { include: false })}
          aria-label="Remove draft transaction"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  )
}

function DraftReviewCard({
  draft,
  accounts,
  categories,
  onUpdateDraft,
  disabled = false,
}: {
  draft: TripImportDraftTransaction
  accounts: Account[]
  categories: Category[]
  onUpdateDraft: (rowIndex: number, patch: Partial<TripImportDraftTransaction>) => void
  disabled?: boolean
}) {
  const issue = draftIssue(draft)
  return (
    <div className={cn("space-y-3 rounded-md border p-3", issue && "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{draft.merchant}</p>
          <p className="text-xs text-muted-foreground">{draft.date}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={disabled}
          onClick={() => onUpdateDraft(draft.rowIndex, { include: false })}
          aria-label="Remove draft transaction"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {issue ? <p className="text-xs text-destructive">{issue}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={draft.date} disabled={disabled} onChange={(event) => onUpdateDraft(draft.rowIndex, { date: event.target.value })} />
        <Input value={draft.merchant} disabled={disabled} onChange={(event) => onUpdateDraft(draft.rowIndex, { merchant: event.target.value })} />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={draft.category}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { category: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category.id ?? category.name} value={categoryNameToValue(category.name)}>
              {category.name}
            </option>
          ))}
        </select>
        {draft.kind === "friend_paid" ? (
          <div className="flex h-9 items-center rounded-md border px-3 text-sm text-muted-foreground">
            Paid by friend
          </div>
        ) : (
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.accountId ?? ""}
            disabled={disabled}
            onChange={(event) => onUpdateDraft(draft.rowIndex, { accountId: event.target.value })}
          >
            <option value="">Select account</option>
            {accountOptions(accounts).map((account) => (
              <option key={account.id} value={account.id?.toString()}>
                {account.account_name}
              </option>
            ))}
          </select>
        )}
        <Input
          value={String(draft.amount)}
          disabled={disabled}
          onChange={(event) => onUpdateDraft(draft.rowIndex, { amount: Number(event.target.value.replace(/[^0-9.]/g, "")) })}
        />
        {draft.kind === "payment" ? (
          <div className="flex h-9 items-center rounded-md border px-3 text-sm text-muted-foreground">
            Payment row
          </div>
        ) : (
          <Input
            value={String(draft.spendingAmount ?? draft.amount)}
            disabled={disabled}
            onChange={(event) => onUpdateDraft(draft.rowIndex, { spendingAmount: Number(event.target.value.replace(/[^0-9.]/g, "")) })}
          />
        )}
      </div>
      <Input
        value={draft.notes ?? ""}
        disabled={disabled}
        onChange={(event) => onUpdateDraft(draft.rowIndex, { notes: event.target.value })}
      />
    </div>
  )
}

function ManualSharedExpenseDialog({
  open,
  onOpenChange,
  tripId,
  accounts,
  categories,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  accounts: Account[]
  categories: Category[]
  onCreated: () => Promise<void>
}) {
  const firstAccountId = accountOptions(accounts)[0]?.id?.toString() ?? ""
  const firstCategory = categories.find((category) => categoryNameToValue(category.name) === "travel")
  const [paidBy, setPaidBy] = React.useState<"me" | "friend">("me")
  const [date, setDate] = React.useState(toLocalDateString(new Date()))
  const [description, setDescription] = React.useState("")
  const [totalCost, setTotalCost] = React.useState("")
  const [myShare, setMyShare] = React.useState("")
  const [currency, setCurrency] = React.useState("CAD")
  const [category, setCategory] = React.useState(firstCategory ? categoryNameToValue(firstCategory.name) : "travel")
  const [accountId, setAccountId] = React.useState(firstAccountId)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setAccountId((current) => current || firstAccountId)
  }, [firstAccountId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add shared expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={paidBy === "me" ? "default" : "outline"}
              onClick={() => setPaidBy("me")}
            >
              I paid
            </Button>
            <Button
              type="button"
              variant={paidBy === "friend" ? "default" : "outline"}
              onClick={() => setPaidBy("friend")}
            >
              Friend paid
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input value={date} onChange={(event) => setDate(event.target.value)} placeholder="YYYY-MM-DD" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Total cost</Label>
              <Input value={totalCost} onChange={(event) => setTotalCost(event.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label>My share</Label>
              <Input value={myShare} onChange={(event) => setMyShare(event.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item.id ?? item.name} value={categoryNameToValue(item.name)}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            {paidBy === "me" ? (
              <div className="space-y-2">
                <Label>Account</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {accountOptions(accounts).map((account) => (
                    <option key={account.id} value={account.id?.toString()}>
                      {account.account_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={async () => {
                const total = Number(totalCost)
                const share = Number(myShare)
                if (!description.trim() || !Number.isFinite(total) || !Number.isFinite(share)) {
                  toast.error("Enter a description and valid amounts")
                  return
                }
                setSubmitting(true)
                try {
                  await createManualSharedExpense({
                    tripId,
                    date,
                    description,
                    paidBy,
                    totalCost: total,
                    myShare: share,
                    currency,
                    grovCategory: category,
                    accountId,
                  })
                  toast.success("Shared expense posted")
                  onOpenChange(false)
                  await onCreated()
                } catch (error) {
                  console.error("Failed to create shared expense:", error)
                  toast.error(error instanceof Error ? error.message : "Failed to add expense")
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              {submitting ? "Adding..." : "Add expense"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
