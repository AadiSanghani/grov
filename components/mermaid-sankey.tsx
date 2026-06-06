"use client"

import { useMemo } from "react"
import { Transaction, PayrollDeduction } from "@/lib/types"
import { getSpendingAmount, isIncomeForReporting } from "@/lib/utils"

/** Sanitize label for Mermaid sankey-beta (ASCII only; non-ASCII breaks the parser). */
function sanitizeLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
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
const DIAGRAM_WIDTH = 1400
const NODE_WIDTH = 10
const NODE_PADDING = 24
const TOP_PADDING = 24
const BOTTOM_PADDING = 28

type SankeyEntry = [string, number]
type SankeyColumn = "source" | "income" | "use" | "destination"

interface SankeyDiagramNode {
  id: string
  label: string
  column: SankeyColumn
  value: number
  sortValue: number
}

interface SankeyDiagramLink {
  source: string
  target: string
  amount: number
}

interface SankeyDiagram {
  nodes: SankeyDiagramNode[]
  links: SankeyDiagramLink[]
}

interface LayoutNode extends SankeyDiagramNode {
  x: number
  y: number
  height: number
  color: string
}

interface LayoutLink extends SankeyDiagramLink {
  sourceNode: LayoutNode
  targetNode: LayoutNode
  sourceY: number
  targetY: number
  width: number
  color: string
}

interface SankeyLayout {
  nodes: LayoutNode[]
  links: LayoutLink[]
  scale: number
}

export interface SankeyBuildResult {
  csv: string
  dynamicHeight: number
  isGrouped: boolean
  cashDrawdownTotal: number
  cashDrawdownToWealth: number
  diagram: SankeyDiagram
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

function combineEntries(entries: SankeyEntry[]): SankeyEntry[] {
  const combined = new Map<string, number>()
  entries.forEach(([label, amount]) => {
    if (amount <= 0) return
    combined.set(label, (combined.get(label) || 0) + amount)
  })
  return Array.from(combined.entries())
}

function accumulateAmount(map: Record<string, number>, label: string, amount: number): void {
  if (amount <= 0) return
  const normalizedLabel = normalizeAggregateLabel(label)
  map[normalizedLabel] = (map[normalizedLabel] || 0) + amount
}

function addLink(links: SankeyDiagramLink[], source: string, target: string, amount: number): void {
  if (amount <= 0) return
  links.push({ source, target, amount })
}

function makeEmptyResult(
  isGrouped: boolean,
  cashDrawdownTotal: number,
  cashDrawdownToWealth: number,
  excludedIncompleteTransfers: SankeyBuildResult["excludedIncompleteTransfers"],
  excludedInternalTransfers: SankeyBuildResult["excludedInternalTransfers"]
): SankeyBuildResult {
  return {
    csv: "",
    dynamicHeight: MIN_SANKEY_HEIGHT,
    isGrouped,
    cashDrawdownTotal,
    cashDrawdownToWealth,
    diagram: { nodes: [], links: [] },
    excludedIncompleteTransfers,
    excludedInternalTransfers,
  }
}

function formatSankeyAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getNodeColor(label: string, index: number): string {
  if (label === "Total Income") return "#f28e2b"
  if (label === "Savings") return "#76b7b2"
  if (label === "Spending & Deductions") return "#e15759"
  if (label === "Existing Cash Used") return "#59a14f"
  if (label === "Direct Investment Deposits") return "#af7aa1"

  const palette = [
    "#4e79a7",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc949",
    "#af7aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac",
    "#f28e2b",
  ]
  return palette[index % palette.length]
}

function buildLayout(diagram: SankeyDiagram, height: number): SankeyLayout {
  const totalDestinationValue = diagram.nodes
    .filter((node) => node.column === "destination")
    .reduce((sum, node) => sum + node.value, 0)
  const destinationCount = diagram.nodes.filter((node) => node.column === "destination").length
  const availableHeight = Math.max(1, height - TOP_PADDING - BOTTOM_PADDING - NODE_PADDING * Math.max(0, destinationCount - 1))
  const scale = totalDestinationValue > 0 ? availableHeight / totalDestinationValue : 0
  const xByColumn: Record<SankeyColumn, number> = {
    source: 24,
    income: 440,
    use: 800,
    destination: DIAGRAM_WIDTH - 34,
  }

  const nodeMap = new Map<string, LayoutNode>()
  const columns: Record<SankeyColumn, LayoutNode[]> = {
    source: [],
    income: [],
    use: [],
    destination: [],
  }

  diagram.nodes.forEach((node, index) => {
    const layoutNode: LayoutNode = {
      ...node,
      x: xByColumn[node.column],
      y: TOP_PADDING,
      height: Math.max(2, node.value * scale),
      color: getNodeColor(node.label, index),
    }
    nodeMap.set(node.id, layoutNode)
    columns[node.column].push(layoutNode)
  })

  const sortedDestinationNodes = columns.destination.sort((a, b) => {
    if (b.sortValue !== a.sortValue) return b.sortValue - a.sortValue
    return a.label.localeCompare(b.label)
  })
  let destinationY = TOP_PADDING
  sortedDestinationNodes.forEach((node) => {
    node.y = destinationY
    destinationY += node.height + NODE_PADDING
  })

  const linksWithNodes = diagram.links
    .map((link) => {
      const sourceNode = nodeMap.get(link.source)
      const targetNode = nodeMap.get(link.target)
      if (!sourceNode || !targetNode) return null
      return { ...link, sourceNode, targetNode }
    })
    .filter((link): link is SankeyDiagramLink & { sourceNode: LayoutNode; targetNode: LayoutNode } => link != null)

  const centerForTargets = (node: LayoutNode) => {
    const outgoing = linksWithNodes.filter((link) => link.source === node.id)
    const total = outgoing.reduce((sum, link) => sum + link.amount, 0)
    if (total <= 0) return height / 2

    return outgoing.reduce((sum, link) => {
      return sum + (link.targetNode.y + link.targetNode.height / 2) * link.amount
    }, 0) / total
  }

  columns.use
    .sort((a, b) => centerForTargets(a) - centerForTargets(b))
    .forEach((node) => {
      node.y = clamp(centerForTargets(node) - node.height / 2, TOP_PADDING, height - BOTTOM_PADDING - node.height)
    })

  const useNodes = [...columns.use].sort((a, b) => a.y - b.y)
  for (let index = 1; index < useNodes.length; index += 1) {
    const previous = useNodes[index - 1]
    const current = useNodes[index]
    if (current.y < previous.y + previous.height + NODE_PADDING) {
      current.y = previous.y + previous.height + NODE_PADDING
    }
  }
  for (let index = useNodes.length - 2; index >= 0; index -= 1) {
    const current = useNodes[index]
    const next = useNodes[index + 1]
    if (next.y + next.height > height - BOTTOM_PADDING) {
      next.y = height - BOTTOM_PADDING - next.height
    }
    if (current.y + current.height + NODE_PADDING > next.y) {
      current.y = next.y - NODE_PADDING - current.height
    }
  }

  columns.income.forEach((node) => {
    node.y = clamp(centerForTargets(node) - node.height / 2, TOP_PADDING, height - BOTTOM_PADDING - node.height)
  })

  const sourceNodes = columns.source.sort((a, b) => {
    if (b.sortValue !== a.sortValue) return b.sortValue - a.sortValue
    return a.label.localeCompare(b.label)
  })
  let sourceY = TOP_PADDING
  sourceNodes.forEach((node) => {
    node.y = sourceY
    sourceY += node.height + NODE_PADDING
  })

  const sourceOffsets = new Map<string, number>()
  const targetOffsets = new Map<string, number>()
  const sortedLinks = [...linksWithNodes].sort((a, b) => {
    const sourceRank = a.sourceNode.y - b.sourceNode.y || a.sourceNode.x - b.sourceNode.x
    if (sourceRank !== 0) return sourceRank
    return a.targetNode.y - b.targetNode.y || b.amount - a.amount
  })

  const layoutLinks = sortedLinks.map((link) => {
    const width = Math.max(1, link.amount * scale)
    const sourceOffset = sourceOffsets.get(link.source) || 0
    const targetOffset = targetOffsets.get(link.target) || 0
    sourceOffsets.set(link.source, sourceOffset + link.amount * scale)
    targetOffsets.set(link.target, targetOffset + link.amount * scale)

    return {
      ...link,
      sourceY: link.sourceNode.y + sourceOffset + width / 2,
      targetY: link.targetNode.y + targetOffset + width / 2,
      width,
      color: link.targetNode.color,
    }
  })

  return {
    nodes: Array.from(nodeMap.values()),
    links: layoutLinks.sort((a, b) => a.width - b.width),
    scale,
  }
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
        const label = `To ${account.name}`
        accumulateAmount(investmentContribByDest, label, netAmount)
        totalInvestmentContributions += netAmount
      } else {
        const category = t.category || "Income"
        const sourceName = (t.merchant || "").trim()
        const incomeLabel = sourceName ? `${category} - ${sourceName}` : category
        const txDeductions = (t.id && deductionsMap?.[t.id]) || t.deductions || []
        const deductionSum = txDeductions.reduce((sum, deduction) => sum + (Number(deduction.amount) || 0), 0)
        const grossAmount = netAmount + deductionSum

        accumulateAmount(incomeBySource, incomeLabel, grossAmount)
        totalIncome += grossAmount

        for (const deduction of txDeductions) {
          const amount = Number(deduction.amount) || 0
          const targetAccount =
            deduction.target_account_id != null ? accountsMap?.[String(deduction.target_account_id)] : undefined

          if (targetAccount?.category === "asset") {
            accumulateAmount(assetTransferByDestination, `To ${targetAccount.name}`, amount)
          } else {
            accumulateAmount(deductionByLabel, deduction.label || "Deduction", amount)
          }
        }
      }
    } else if (t.transaction_type === "outgoing") {
      accumulateAmount(expenseByCategory, t.category || "Expense", getSpendingAmount(t))
    } else if (t.transaction_type === "transfer" && t.to_account_type_id && accountsMap) {
      const toAccount = accountsMap[t.to_account_type_id]
      const fromAccount = t.account_type_id != null ? accountsMap[t.account_type_id] : undefined
      const amount = Number(t.amount) || 0

      if (!toAccount || amount <= 0) {
        return
      }
      if (toAccount.category !== "asset") {
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

      const isCashToCash = fromAccount.accountType === "Cash" && toAccount.accountType === "Cash"
      const shouldIncludeCashToCash = isCashToCash && toAccount.accountSubtype === "Savings"
      const shouldExcludeAsInternal = isCashToCash && !shouldIncludeCashToCash
      const isSameAccountBucketTransfer =
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

      accumulateAmount(assetTransferByDestination, `To ${toAccount.name}`, amount)
    }
  })

  const totalIncomeLabel = "Total Income"
  const investmentContribLabel = "Direct Investment Deposits"
  const savingsHubLabel = "Savings"
  const spendingHubLabel = "Spending & Deductions"
  const remainingSavingsLabel = "Remaining Savings"
  const cashDrawdownLabel = "Existing Cash Used"
  const groupedIncomeSources = groupTopEntries(
    Object.entries(incomeBySource),
    TOP_INCOME_SOURCES,
    "Other Income Sources"
  )
  const groupedCashOutflows = groupTopEntries(
    combineEntries([...Object.entries(expenseByCategory), ...Object.entries(deductionByLabel)]),
    TOP_OUTFLOWS,
    "Other Outflows"
  )
  const groupedWealthDestinations = groupTopEntries(
    combineEntries([...Object.entries(assetTransferByDestination), ...Object.entries(investmentContribByDest)]),
    TOP_OUTFLOWS,
    "Other Investment & Savings Transfers"
  )

  const links: SankeyDiagramLink[] = []
  const nodeValues = new Map<string, { label: string; column: SankeyColumn; value: number; sortValue: number }>()
  const registerNode = (label: string, column: SankeyColumn, value: number, sortValue = value) => {
    if (value <= 0) return
    const current = nodeValues.get(label)
    if (!current) {
      nodeValues.set(label, { label, column, value, sortValue })
      return
    }
    current.value = Math.max(current.value, value)
    current.sortValue = Math.max(current.sortValue, sortValue)
  }

  groupedIncomeSources.entries.forEach(([sourceLabel, amount]) => {
    registerNode(sourceLabel, "source", amount)
    addLink(links, sourceLabel, totalIncomeLabel, amount)
  })

  const groupedAssetDestinations = groupTopEntries(
    Object.entries(assetTransferByDestination),
    TOP_OUTFLOWS,
    "Other Investment & Savings Transfers"
  )
  const totalAssetWealthFunding = sumEntries(groupedAssetDestinations.entries)
  const spendingTotal = sumEntries(groupedCashOutflows.entries)
  const wealthDestinationTotal = sumEntries(groupedWealthDestinations.entries)
  const requestedOutflows = spendingTotal + wealthDestinationTotal
  const cashDrawdownTotal = Math.max(0, requestedOutflows - totalIncome - totalInvestmentContributions)
  const totalAvailableFunds = totalIncome + totalInvestmentContributions + cashDrawdownTotal
  const remainingIncome = Math.max(0, totalAvailableFunds - requestedOutflows)
  const incomeAfterSpending = Math.max(0, totalIncome + totalInvestmentContributions - spendingTotal)
  const cashDrawdownToWealth = Math.max(0, totalAssetWealthFunding - incomeAfterSpending)
  const savingsTotal = wealthDestinationTotal + remainingIncome

  if (cashDrawdownTotal > 0) {
    registerNode(cashDrawdownLabel, "source", cashDrawdownTotal)
    addLink(links, cashDrawdownLabel, totalIncomeLabel, cashDrawdownTotal)
  }
  if (totalInvestmentContributions > 0) {
    registerNode(investmentContribLabel, "source", totalInvestmentContributions)
    addLink(links, investmentContribLabel, totalIncomeLabel, totalInvestmentContributions)
  }

  registerNode(totalIncomeLabel, "income", totalAvailableFunds)

  if (spendingTotal > 0) {
    registerNode(spendingHubLabel, "use", spendingTotal)
    addLink(links, totalIncomeLabel, spendingHubLabel, spendingTotal)
  }

  if (savingsTotal > 0) {
    registerNode(savingsHubLabel, "use", savingsTotal)
    addLink(links, totalIncomeLabel, savingsHubLabel, savingsTotal)
  }

  groupedWealthDestinations.entries.forEach(([label, amount]) => {
    registerNode(label, "destination", amount)
    addLink(links, savingsHubLabel, label, amount)
  })
  groupedCashOutflows.entries.forEach(([label, amount]) => {
    registerNode(label, "destination", amount)
    addLink(links, spendingHubLabel, label, amount)
  })

  if (remainingIncome > 0) {
    registerNode(remainingSavingsLabel, "destination", remainingIncome)
    addLink(links, savingsHubLabel, remainingSavingsLabel, remainingIncome)
  }

  const nodes: SankeyDiagramNode[] = Array.from(nodeValues.entries()).map(([id, node]) => ({
    id,
    label: node.label,
    column: node.column,
    value: node.value,
    sortValue: node.sortValue,
  }))
  const csvLines = links.map((link) => {
    return `${escapeCsvValue(link.source)}, ${escapeCsvValue(link.target)}, ${link.amount}`
  })

  const leftNodes =
    groupedIncomeSources.entries.length + (cashDrawdownTotal > 0 ? 1 : 0) + (totalInvestmentContributions > 0 ? 1 : 0)
  const useNodes = (spendingTotal > 0 ? 1 : 0) + (savingsTotal > 0 ? 1 : 0)
  const rightNodes = groupedCashOutflows.entries.length + groupedWealthDestinations.entries.length + (remainingIncome > 0 ? 1 : 0)
  const maxColumnNodes = Math.max(leftNodes, rightNodes)
  const dynamicHeight = clamp(
    (maxColumnNodes + useNodes + NODE_HEIGHT_BUFFER) * NODE_HEIGHT_MULTIPLIER,
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
  const excludedIncompleteTransfers = {
    count: excludedIncompleteTransferCount,
    totalAmount: excludedIncompleteTransferTotal,
    topDestinations: excludedIncompleteTopDestinations,
  }
  const excludedInternalTransfers = {
    count: excludedInternalTransferCount,
    totalAmount: excludedInternalTransferTotal,
    topDestinations: excludedTopDestinations,
  }

  if (links.length === 0) {
    return makeEmptyResult(
      isGrouped,
      cashDrawdownTotal,
      cashDrawdownToWealth,
      excludedIncompleteTransfers,
      excludedInternalTransfers
    )
  }

  return {
    csv: `sankey-beta\n${csvLines.join("\n")}`,
    dynamicHeight,
    isGrouped,
    cashDrawdownTotal,
    cashDrawdownToWealth,
    diagram: { nodes, links },
    excludedIncompleteTransfers,
    excludedInternalTransfers,
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
  const sankeyData = useMemo(
    () => buildResult ?? buildSankeyData(transactions, accountsMap, deductionsMap),
    [buildResult, transactions, accountsMap, deductionsMap]
  )
  const layout = useMemo(
    () => buildLayout(sankeyData.diagram, sankeyData.dynamicHeight),
    [sankeyData.diagram, sankeyData.dynamicHeight]
  )

  if (sankeyData.diagram.links.length === 0) {
    return (
      <div className={className}>
        <p className="text-muted-foreground text-sm p-4">No transaction data to display.</p>
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{ minHeight: `${sankeyData.dynamicHeight}px`, width: "100%" }}
    >
      <svg
        role="img"
        aria-label="Cash flow Sankey diagram"
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${sankeyData.dynamicHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full min-h-full w-full overflow-visible"
      >
        <g fill="none">
          {layout.links.map((link) => {
            const sourceX = link.sourceNode.x + NODE_WIDTH
            const targetX = link.targetNode.x
            const curveX = sourceX + (targetX - sourceX) * 0.55
            const path = `M${sourceX},${link.sourceY} C${curveX},${link.sourceY} ${curveX},${link.targetY} ${targetX},${link.targetY}`
            return (
              <path
                key={`${link.source}-${link.target}-${link.amount}`}
                d={path}
                stroke={link.color}
                strokeWidth={link.width}
                strokeOpacity={0.42}
                className="mix-blend-multiply"
              />
            )
          })}
        </g>
        <g>
          {layout.nodes.map((node) => {
            const isRightSide = node.column === "destination"
            const labelX = isRightSide ? node.x - 8 : node.x + NODE_WIDTH + 8
            const anchor = isRightSide ? "end" : "start"
            return (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={node.height}
                  fill={node.color}
                />
                <text
                  x={labelX}
                  y={node.y + node.height / 2}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  paintOrder="stroke"
                  stroke="hsl(var(--background))"
                  strokeWidth={5}
                  className="fill-foreground text-[14px]"
                >
                  {node.label} {formatSankeyAmount(node.value)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
