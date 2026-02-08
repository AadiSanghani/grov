"use client"

import { useLayoutEffect, useRef, useId } from "react"
import mermaid from "mermaid"
import { Transaction } from "@/lib/types"
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

export type AccountMap = Record<string, { name: string; category: "asset" | "liability" }>

function buildSankeyCsv(
  transactions: Transaction[],
  accountsMap?: AccountMap
): string {
  const incomeBySource: Record<string, number> = {}
  const expenseByCategory: Record<string, number> = {}
  const assetTransferByDestination: Record<string, number> = {}
  let totalIncome = 0
  let totalExpenses = 0
  let totalAssetTransfers = 0

  transactions.forEach((t) => {
    if (t.transaction_type === "incoming") {
      const amount = Number(t.amount) || 0
      const category = t.category || "Income"
      const sourceName = (t.merchant || "").trim()
      const incomeLabel = sourceName ? `${category} - ${sourceName}` : category
      incomeBySource[incomeLabel] = (incomeBySource[incomeLabel] || 0) + amount
      totalIncome += amount
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
  const savingsLabel = "Savings"

  Object.entries(incomeBySource).forEach(([sourceLabel, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(sourceLabel)}, ${escapeCsvValue(totalIncomeLabel)}, ${amount}`)
    }
  })

  Object.entries(expenseByCategory).forEach(([category, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(category)}, ${amount}`)
    }
  })

  Object.entries(assetTransferByDestination).forEach(([label, amount]) => {
    if (amount > 0) {
      lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(label)}, ${amount}`)
    }
  })

  const savings = totalIncome - totalExpenses - totalAssetTransfers
  if (savings > 0) {
    lines.push(`${escapeCsvValue(totalIncomeLabel)}, ${escapeCsvValue(savingsLabel)}, ${savings}`)
  }

  if (lines.length === 0) {
    return ""
  }
  return `sankey-beta\n${lines.join("\n")}`
}

interface MermaidSankeyProps {
  transactions: Transaction[]
  accountsMap?: AccountMap
  className?: string
}

export function MermaidSankey({ transactions, accountsMap, className }: MermaidSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, "-")
  const renderCountRef = useRef(0)

  useLayoutEffect(() => {
    const csv = buildSankeyCsv(transactions, accountsMap)
    if (!csv) return

    renderCountRef.current += 1
    const diagramId = `sankey-${reactId}-${renderCountRef.current}`

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
    })

    let cancelled = false
    const render = async () => {
      try {
        const { svg } = await mermaid.render(diagramId, csv)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
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
  }, [transactions, accountsMap, reactId]);

  const csv = buildSankeyCsv(transactions, accountsMap)
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
      style={{ minHeight: 200 }}
    />
  )
}
