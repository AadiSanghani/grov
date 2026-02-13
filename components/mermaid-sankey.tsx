"use client"

import { useLayoutEffect, useRef, useId } from "react"
import mermaid from "mermaid"
import { Transaction, PayrollDeduction } from "@/lib/types"
import { getSpendingAmount } from "@/lib/utils"

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

export type AccountMap = Record<string, { name: string; category: "asset" | "liability"; accountType: string }>

/** Map of transaction id -> PayrollDeduction[] */
export type DeductionsMap = Record<string, PayrollDeduction[]>

function buildSankeyCsv(
  transactions: Transaction[],
  accountsMap?: AccountMap,
  deductionsMap?: DeductionsMap
): string {
  const incomeBySource: Record<string, number> = {}
  const expenseByCategory: Record<string, number> = {}
  const assetTransferByDestination: Record<string, number> = {}
  const deductionByLabel: Record<string, number> = {}
  const investmentContribByDest: Record<string, number> = {}
  let totalIncome = 0
  let totalExpenses = 0
  let totalAssetTransfers = 0
  let totalDeductions = 0
  let totalInvestmentContributions = 0

  transactions.forEach((t) => {
    if (t.transaction_type === "incoming") {
      const netAmount = Number(t.amount) || 0
      const account = t.account_type_id != null ? accountsMap?.[t.account_type_id] : undefined
      const isInvestment = account?.accountType === "Investments"

      if (isInvestment && account) {
        // Investment contributions (e.g. direct RRSP/TFSA deposits) — separate flow
        const label = `To ${account.name}`
        investmentContribByDest[label] = (investmentContribByDest[label] || 0) + netAmount
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

        incomeBySource[incomeLabel] = (incomeBySource[incomeLabel] || 0) + grossAmount
        totalIncome += grossAmount

        // Accumulate deductions by label
        for (const d of txDeductions) {
          const dedLabel = d.label || "Deduction"
          const dedAmount = Number(d.amount) || 0
          deductionByLabel[dedLabel] = (deductionByLabel[dedLabel] || 0) + dedAmount
          totalDeductions += dedAmount
        }
      }
    } else if (t.transaction_type === "outgoing") {
      const category = t.category || "Expense"
      const amount = getSpendingAmount(t)
      expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
      totalExpenses += amount
    } else if (t.transaction_type === "transfer" && t.to_account_type_id && accountsMap) {
      const toAccount = accountsMap[t.to_account_type_id]
      if (toAccount?.category === "asset") {
        const label = `To ${toAccount.name}`
        const amount = Number(t.amount) || 0
        assetTransferByDestination[label] = (assetTransferByDestination[label] || 0) + amount
        totalAssetTransfers += amount
      }
      // Transfers to liability (e.g. CC payments) are excluded from diagram
    }
  })

  const lines: string[] = []
  const totalIncomeLabel = "Total Income"
  const investmentContribLabel = "Investment Contributions"
  const savingsLabel = "Savings"

  // Income sources (gross) → Total Income
  Object.entries(incomeBySource).forEach(([sourceLabel, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(sourceLabel)}, ${escapeCsvValue(totalIncomeLabel)}, ${amount}`)
    }
  })

  // Total Income → expense categories
  Object.entries(expenseByCategory).forEach(([category, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(category)}, ${amount}`)
    }
  })

  // Total Income → asset transfers
  Object.entries(assetTransferByDestination).forEach(([label, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(label)}, ${amount}`)
    }
  })

  // Total Income → deductions (taxes, CPP, etc.)
  Object.entries(deductionByLabel).forEach(([label, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(label)}, ${amount}`)
    }
  })

  // Savings residual: gross income - expenses - transfers - deductions
  const savings = totalIncome - totalExpenses - totalAssetTransfers - totalDeductions
  if (savings > 0) {
    lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(savingsLabel)}, ${savings}`)
  }

  // Investment contributions as a separate flow (not part of Total Income)
  if (totalInvestmentContributions > 0) {
    Object.entries(investmentContribByDest).forEach(([label, amount]) => {
      if (amount > 0) {
        lines.push(`${escapeCsvValue(investmentContribLabel)}, ${escapeCsvValue(label)}, ${amount}`)
      }
    })
  }

  if (lines.length === 0) {
    return ""
  }
  return `sankey-beta\n${lines.join("\n")}`
}

interface MermaidSankeyProps {
  transactions: Transaction[]
  accountsMap?: AccountMap
  deductionsMap?: DeductionsMap
  className?: string
}

export function MermaidSankey({ transactions, accountsMap, deductionsMap, className }: MermaidSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, "-")
  const renderCountRef = useRef(0)

  useLayoutEffect(() => {
    const csv = buildSankeyCsv(transactions, accountsMap, deductionsMap)
    if (!csv) return

    renderCountRef.current += 1
    const diagramId = `sankey-${reactId}-${renderCountRef.current}`

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      sankey: {
        width: 1400,
        height: 700,
        useMaxWidth: true,
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
  }, [transactions, accountsMap, deductionsMap, reactId]);

  const csv = buildSankeyCsv(transactions, accountsMap, deductionsMap)
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
      style={{ minHeight: "70vh", width: "100%" }}
    />
  )
}
