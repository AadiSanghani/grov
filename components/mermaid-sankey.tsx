"use client"

import { useLayoutEffect, useMemo, useRef, useId } from "react"
import mermaid from "mermaid"
import { Transaction, PayrollDeduction } from "@/lib/types"
import { getSpendingAmount, isIncomeForReporting } from "@/lib/utils"

/** Sanitize label for Mermaid sankey-beta (ASCII only; non-ASCII breaks the parser). */
function sanitizeLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "") // strip non-ASCII
    .trim() || "Unnamed"
}

function escapeCsvValue(value: string): string {
  const safe = sanitizeLabel(value)
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

export type AccountMap = Record<
  string,
  { name: string; category: "asset" | "liability"; accountType: string; accountSubtype: string }
>

/** Map of transaction id -> PayrollDeduction[] */
export type DeductionsMap = Record<string, PayrollDeduction[]>

const TOP_INCOME_SOURCES = 12
const TOP_OUTFLOWS = 20
const MIN_SANKEY_HEIGHT = 700
const MAX_SANKEY_HEIGHT = 2200
const NODE_HEIGHT_MULTIPLIER = 28
const NODE_HEIGHT_BUFFER = 4

type SankeyEntry = [string, number]

export interface SankeyBuildResult {
  csv: string
  dynamicHeight: number
  isGrouped: boolean
  cashDrawdownTotal: number
  cashDrawdownToWealth: number
  excludedIncompleteTransfers: {
    count: number
    totalAmount: number
    topDestinations: Array<{ destination: string; amount: number }>
  }
  excludedInternalTransfers: {
    count: number
    totalAmount: number
    topDestinations: Array<{ destination: string; amount: number }>
  }
}

function normalizeAggregateLabel(value: string): string {
  return (
    value
      .replace(/\s*-\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim() || "Unnamed"
  )
}

function sortByAmountDesc(a: SankeyEntry, b: SankeyEntry) {
  if (b[1] !== a[1]) return b[1] - a[1]
  return a[0].localeCompare(b[0])
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function groupTopEntries(
  entries: SankeyEntry[],
  limit: number,
  otherLabel: string
): { entries: SankeyEntry[]; grouped: boolean } {
  const positive = entries.filter(([, amount]) => amount > 0).sort(sortByAmountDesc)
  if (positive.length <= limit) {
    return { entries: positive, grouped: false }
  }

  const kept = positive.slice(0, limit)
  const otherTotal = positive.slice(limit).reduce((sum, [, amount]) => sum + amount, 0)
  const groupedEntries = otherTotal > 0 ? [...kept, [otherLabel, otherTotal] as SankeyEntry] : kept

  return { entries: groupedEntries.sort(sortByAmountDesc), grouped: true }
}

function sumEntries(entries: SankeyEntry[]): number {
  return entries.reduce((sum, [, amount]) => sum + amount, 0)
}

function accumulateAmount(map: Record<string, number>, label: string, amount: number): void {
  if (amount <= 0) return
  const normalizedLabel = normalizeAggregateLabel(label)
  map[normalizedLabel] = (map[normalizedLabel] || 0) + amount
}

export function buildSankeyData(
  transactions: Transaction[],
  accountsMap?: AccountMap,
  deductionsMap?: DeductionsMap
): SankeyBuildResult {
  const incomeBySource: Record<string, number> = {}
  const expenseByCategory: Record<string, number> = {}
  const assetTransferByDestination: Record<string, number> = {}
  const deductionByLabel: Record<string, number> = {}
  const investmentContribByDest: Record<string, number> = {}
  let totalIncome = 0
  let totalInvestmentContributions = 0
  let excludedInternalTransferCount = 0
  let excludedInternalTransferTotal = 0
  let excludedIncompleteTransferCount = 0
  let excludedIncompleteTransferTotal = 0
  const excludedInternalTransferByDestination: Record<string, number> = {}
  const excludedIncompleteTransferByDestination: Record<string, number> = {}

  transactions.forEach((t) => {
    if (t.transaction_type === "incoming") {
      if (!isIncomeForReporting(t)) {
        return
      }
      const netAmount = Number(t.amount) || 0
      const account = t.account_type_id != null ? accountsMap?.[t.account_type_id] : undefined
      const isInvestment = account?.accountType === "Investments"

      if (isInvestment && account) {
        // Investment contributions (e.g. direct RRSP/TFSA deposits) — separate flow
        const label = `To ${account.name}`
        accumulateAmount(investmentContribByDest, label, netAmount)
        totalInvestmentContributions += netAmount
      } else {
        // Regular cash income — flows into Total Income
        const category = t.category || "Income"
        const sourceName = (t.merchant || "").trim()
        const incomeLabel = sourceName ? `${category} - ${sourceName}` : category

        // Sum deductions for this transaction to compute gross
        const txDeductions = (t.id && deductionsMap?.[t.id]) || t.deductions || []
        const deductionSum = txDeductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
        const grossAmount = netAmount + deductionSum

        accumulateAmount(incomeBySource, incomeLabel, grossAmount)
        totalIncome += grossAmount

        // Accumulate deductions by label
        for (const d of txDeductions) {
          const dedAmount = Number(d.amount) || 0
          const targetAccount =
            d.target_account_id != null ? accountsMap?.[String(d.target_account_id)] : undefined

          if (targetAccount?.category === "asset") {
            const label = `To ${targetAccount.name}`
            accumulateAmount(assetTransferByDestination, label, dedAmount)
          } else {
            const dedLabel = d.label || "Deduction"
            accumulateAmount(deductionByLabel, dedLabel, dedAmount)
          }
        }
      }
    } else if (t.transaction_type === "outgoing") {
      const category = t.category || "Expense"
      const amount = getSpendingAmount(t)
      accumulateAmount(expenseByCategory, category, amount)
    } else if (t.transaction_type === "transfer" && t.to_account_type_id && accountsMap) {
      const toAccount = accountsMap[t.to_account_type_id]
      const fromAccount = t.account_type_id != null ? accountsMap[t.account_type_id] : undefined
      const amount = Number(t.amount) || 0

      if (!toAccount || amount <= 0) {
        return
      }
      if (toAccount.category !== "asset") {
        // Transfers to liability (e.g. CC payments) are excluded from diagram
        return
      }
      if (!fromAccount) {
        const destinationLabel = normalizeAggregateLabel(`To ${toAccount.name}`)
        excludedIncompleteTransferCount += 1
        excludedIncompleteTransferTotal += amount
        excludedIncompleteTransferByDestination[destinationLabel] =
          (excludedIncompleteTransferByDestination[destinationLabel] || 0) + amount
        return
      }

      const isCashToCash = fromAccount?.accountType === "Cash" && toAccount.accountType === "Cash"
      const shouldIncludeCashToCash = isCashToCash && toAccount.accountSubtype === "Savings"
      const shouldExcludeAsInternal = isCashToCash && !shouldIncludeCashToCash
      const isSameAccountBucketTransfer =
        !!fromAccount &&
        fromAccount.category === "asset" &&
        toAccount.category === "asset" &&
        fromAccount.accountType === toAccount.accountType &&
        fromAccount.accountSubtype === toAccount.accountSubtype

      if (shouldExcludeAsInternal || isSameAccountBucketTransfer) {
        const destinationLabel = normalizeAggregateLabel(`To ${toAccount.name}`)
        excludedInternalTransferCount += 1
        excludedInternalTransferTotal += amount
        excludedInternalTransferByDestination[destinationLabel] =
          (excludedInternalTransferByDestination[destinationLabel] || 0) + amount
        return
      }

      const label = `To ${toAccount.name}`
      accumulateAmount(assetTransferByDestination, label, amount)
    }
  })

  const lines: string[] = []
  const totalIncomeLabel = "Total Income"
  const investmentContribLabel = "Direct Investment Deposits"
  const wealthFundingLabel = "Investment & Savings Funding"
  const savingsLabel = "Savings"
  const cashDrawdownLabel = "Existing Cash Used"
  const groupedIncomeSources = groupTopEntries(
    Object.entries(incomeBySource),
    TOP_INCOME_SOURCES,
    "Other Income Sources"
  )
  const investmentDestinations = Object.entries(investmentContribByDest)
    .filter(([, amount]) => amount > 0)
    .sort(sortByAmountDesc)

  // Income sources (gross) → Total Income
  groupedIncomeSources.entries.forEach(([sourceLabel, amount]) => {
    lines.push(`${escapeCsvValue(sourceLabel)}, ${escapeCsvValue(totalIncomeLabel)}, ${amount}`)
  })

  // Cash expenses and non-investment payroll deductions consume period income first.
  const cashOutflows: Array<[string, number]> = [
    ...Object.entries(expenseByCategory),
    ...Object.entries(deductionByLabel),
  ]
  const groupedCashOutflows = groupTopEntries(cashOutflows, TOP_OUTFLOWS, "Other Outflows")
  let remainingIncome = totalIncome
  let cashDrawdownTotal = 0

  groupedCashOutflows.entries.forEach(([label, amount]) => {
    const incomeFundedAmount = Math.min(amount, remainingIncome)
    const drawdownFundedAmount = amount - incomeFundedAmount

    if (incomeFundedAmount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(label)}, ${incomeFundedAmount}`)
      remainingIncome -= incomeFundedAmount
    }
    if (drawdownFundedAmount > 0) {
      lines.push(`${escapeCsvValue(cashDrawdownLabel)}, ${escapeCsvValue(label)}, ${drawdownFundedAmount}`)
      cashDrawdownTotal += drawdownFundedAmount
    }
  })

  // Asset transfers and targeted payroll deductions are wealth-building flows, not spending.
  const groupedWealthDestinations = groupTopEntries(
    Object.entries(assetTransferByDestination),
    TOP_OUTFLOWS,
    "Other Investment & Savings Transfers"
  )
  const totalWealthFunding = sumEntries(groupedWealthDestinations.entries)
  const incomeFundedWealth = Math.min(totalWealthFunding, remainingIncome)
  const cashDrawdownToWealth = totalWealthFunding - incomeFundedWealth

  if (incomeFundedWealth > 0) {
    lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(wealthFundingLabel)}, ${incomeFundedWealth}`)
    remainingIncome -= incomeFundedWealth
  }
  if (cashDrawdownToWealth > 0) {
    lines.push(`${escapeCsvValue(cashDrawdownLabel)}, ${escapeCsvValue(wealthFundingLabel)}, ${cashDrawdownToWealth}`)
    cashDrawdownTotal += cashDrawdownToWealth
  }
  groupedWealthDestinations.entries.forEach(([label, amount]) => {
    lines.push(`${escapeCsvValue(wealthFundingLabel)}, ${escapeCsvValue(label)}, ${amount}`)
  })

  if (remainingIncome > 0) {
    lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(savingsLabel)}, ${remainingIncome}`)
  }

  // Investment contributions as a separate flow (not part of Total Income)
  if (totalInvestmentContributions > 0) {
    investmentDestinations.forEach(([label, amount]) => {
      lines.push(`${escapeCsvValue(investmentContribLabel)}, ${escapeCsvValue(label)}, ${amount}`)
    })
  }

  const leftNodes =
    groupedIncomeSources.entries.length + (cashDrawdownTotal > 0 ? 1 : 0) + (totalInvestmentContributions > 0 ? 1 : 0)
  const middleNodes = totalWealthFunding > 0 ? 2 : 1
  const rightNodes = groupedCashOutflows.entries.length + groupedWealthDestinations.entries.length + investmentDestinations.length
  const maxColumnNodes = Math.max(leftNodes, rightNodes)
  const dynamicHeight = clamp(
    (maxColumnNodes + middleNodes + NODE_HEIGHT_BUFFER) * NODE_HEIGHT_MULTIPLIER,
    MIN_SANKEY_HEIGHT,
    MAX_SANKEY_HEIGHT
  )

  const isGrouped = groupedIncomeSources.grouped || groupedCashOutflows.grouped || groupedWealthDestinations.grouped
  const excludedTopDestinations = Object.entries(excludedInternalTransferByDestination)
    .filter(([, amount]) => amount > 0)
    .sort(sortByAmountDesc)
    .slice(0, 3)
    .map(([destination, amount]) => ({ destination, amount }))
  const excludedIncompleteTopDestinations = Object.entries(excludedIncompleteTransferByDestination)
    .filter(([, amount]) => amount > 0)
    .sort(sortByAmountDesc)
    .slice(0, 3)
    .map(([destination, amount]) => ({ destination, amount }))

  if (lines.length === 0) {
    return {
      csv: "",
      dynamicHeight: MIN_SANKEY_HEIGHT,
      isGrouped,
      cashDrawdownTotal,
      cashDrawdownToWealth,
      excludedIncompleteTransfers: {
        count: excludedIncompleteTransferCount,
        totalAmount: excludedIncompleteTransferTotal,
        topDestinations: excludedIncompleteTopDestinations,
      },
      excludedInternalTransfers: {
        count: excludedInternalTransferCount,
        totalAmount: excludedInternalTransferTotal,
        topDestinations: excludedTopDestinations,
      },
    }
  }

  return {
    csv: `sankey-beta\n${lines.join("\n")}`,
    dynamicHeight,
    isGrouped,
    cashDrawdownTotal,
    cashDrawdownToWealth,
    excludedIncompleteTransfers: {
      count: excludedIncompleteTransferCount,
      totalAmount: excludedIncompleteTransferTotal,
      topDestinations: excludedIncompleteTopDestinations,
    },
    excludedInternalTransfers: {
      count: excludedInternalTransferCount,
      totalAmount: excludedInternalTransferTotal,
      topDestinations: excludedTopDestinations,
    },
  }
}

interface MermaidSankeyProps {
  transactions: Transaction[]
  accountsMap?: AccountMap
  deductionsMap?: DeductionsMap
  buildResult?: SankeyBuildResult
  className?: string
}

export function MermaidSankey({
  transactions,
  accountsMap,
  deductionsMap,
  buildResult,
  className,
}: MermaidSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, "-")
  const renderCountRef = useRef(0)
  const sankeyData = useMemo(
    () => buildResult ?? buildSankeyData(transactions, accountsMap, deductionsMap),
    [buildResult, transactions, accountsMap, deductionsMap]
  )

  useLayoutEffect(() => {
    const csv = sankeyData.csv
    if (!csv) return

    renderCountRef.current += 1
    const diagramId = `sankey-${reactId}-${renderCountRef.current}`

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      sankey: {
        width: 1400,
        height: sankeyData.dynamicHeight,
        useMaxWidth: true,
        showValues: true,
      },
    })

    let cancelled = false
    const render = async () => {
      try {
        const { svg } = await mermaid.render(diagramId, csv)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          const svgEl = containerRef.current.querySelector("svg")
          if (svgEl) {
            svgEl.removeAttribute("width")
            svgEl.removeAttribute("height")
            svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet")
            svgEl.style.width = "100%"
            svgEl.style.height = "100%"
          }
        }
      } catch (err) {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<p class="text-muted-foreground text-sm p-4">Unable to render diagram. Not enough flow data.</p>`
        }
        console.warn("Mermaid Sankey render error:", err)
      }
    }

    // Defer render until after the container is in the DOM and laid out (fixes first-load not showing)
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return
        render()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [sankeyData, reactId]);

  const csv = sankeyData.csv
  if (!csv) {
    return (
      <div className={className}>
        <p className="text-muted-foreground text-sm p-4">No transaction data to display.</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: `${sankeyData.dynamicHeight}px`, width: "100%" }}
    />
  )
}
