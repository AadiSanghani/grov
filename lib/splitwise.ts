const REQUIRED_COLUMNS = ["Date", "Description", "Category", "Cost", "Currency"]
const MONEY_TOLERANCE = 0.005

export interface SplitwiseParsedRow {
  rowIndex: number
  date: string
  description: string
  splitwiseCategory: string
  grovCategory: string
  cost: number
  currency: string
  selfNet: number
  selfShare: number
  entryKind: "expense" | "payment"
  paymentDirection: "received" | "sent" | null
  payerNames: string[]
  participantAmounts: Record<string, number>
  rawRow: Record<string, string>
  postingStatus: "posted" | "ignored" | "needs_review"
}

export interface SplitwiseParseResult {
  headers: string[]
  participants: string[]
  rows: SplitwiseParsedRow[]
  currencies: string[]
  suggestedSelfParticipant: string | null
  summary: {
    rowCount: number
    expenseCount: number
    paymentCount: number
    ignoredCount: number
    totalCost: number
    totalSelfShare: number
    totalSelfNet: number
    settled: boolean
  }
}

export function parseCurrencyAmount(value: string | number | null | undefined): number {
  if (value == null) return 0
  const parsed = Number(String(value).replace(/[$,\s]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell)
      cell = ""
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1
      row.push(cell)
      if (row.some((value) => value.trim() !== "")) rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.trim() !== "")) rows.push(row)
  }

  return rows
}

function inferPayerNames(
  participantAmounts: Record<string, number>,
  selfParticipant: string
): string[] {
  const payers = Object.entries(participantAmounts)
    .filter(([, amount]) => amount > MONEY_TOLERANCE)
    .map(([name]) => name)

  if (payers.length > 0) return payers
  return participantAmounts[selfParticipant] !== undefined ? [selfParticipant] : []
}

function inferDefaultCategory(splitwiseCategory: string): string {
  const value = splitwiseCategory.trim().toLowerCase()
  if (["plane", "hotel", "car", "gas/fuel", "parking"].includes(value)) return "travel"
  if (["dining out", "groceries"].includes(value)) return "restaurants"
  if (value.includes("phone") || value.includes("internet")) return "telecom"
  return "travel"
}

function categoryNameToValue(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

export function parseSplitwiseCsv(
  csvText: string,
  options?: {
    selfParticipant?: string
    categoryMap?: Record<string, string>
  }
): SplitwiseParseResult {
  const csvRows = parseCsv(csvText)
  if (csvRows.length === 0) {
    throw new Error("CSV is empty")
  }

  const headers = csvRows[0].map((header) => header.trim())
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw new Error(`Missing required Splitwise column: ${column}`)
    }
  }

  const participants = headers.slice(REQUIRED_COLUMNS.length).filter(Boolean)
  if (participants.length === 0) {
    throw new Error("No participant columns found")
  }

  const suggestedSelfParticipant =
    participants.find((name) => name.toLowerCase() === "aadi") ?? participants[0] ?? null
  const selfParticipant = options?.selfParticipant ?? suggestedSelfParticipant
  if (!selfParticipant || !participants.includes(selfParticipant)) {
    throw new Error("Selected participant was not found in the CSV")
  }

  const rows: SplitwiseParsedRow[] = []
  const currencySet = new Set<string>()

  csvRows.slice(1).forEach((csvRow, index) => {
    const rawRow = Object.fromEntries(
      headers.map((header, headerIndex) => [header, csvRow[headerIndex] ?? ""])
    )
    const splitwiseCategory = rawRow.Category?.trim() || "General"
    const entryKind = splitwiseCategory === "Payment" ? "payment" : "expense"
    const cost = roundMoney(parseCurrencyAmount(rawRow.Cost))
    const currency = rawRow.Currency?.trim() || "CAD"
    const selfNet = roundMoney(parseCurrencyAmount(rawRow[selfParticipant]))
    const participantAmounts = Object.fromEntries(
      participants.map((participant) => [
        participant,
        roundMoney(parseCurrencyAmount(rawRow[participant])),
      ])
    )
    const selfShare =
      entryKind === "payment"
        ? roundMoney(Math.abs(selfNet))
        : selfNet > MONEY_TOLERANCE
          ? roundMoney(Math.max(0, cost - selfNet))
          : selfNet < -MONEY_TOLERANCE
            ? roundMoney(Math.abs(selfNet))
            : 0
    const grovCategory =
      options?.categoryMap?.[splitwiseCategory] ??
      inferDefaultCategory(splitwiseCategory)
    const paymentDirection =
      entryKind === "payment"
        ? selfNet < -MONEY_TOLERANCE
          ? "received"
          : selfNet > MONEY_TOLERANCE
            ? "sent"
            : null
        : null
    const postingStatus =
      entryKind === "expense" && selfShare <= MONEY_TOLERANCE
        ? "ignored"
        : "posted"

    currencySet.add(currency)
    rows.push({
      rowIndex: index + 2,
      date: rawRow.Date,
      description: rawRow.Description?.trim() || "Splitwise row",
      splitwiseCategory,
      grovCategory: categoryNameToValue(grovCategory),
      cost,
      currency,
      selfNet,
      selfShare,
      entryKind,
      paymentDirection,
      payerNames: inferPayerNames(participantAmounts, selfParticipant),
      participantAmounts,
      rawRow,
      postingStatus,
    })
  })

  const expenseRows = rows.filter((row) => row.entryKind === "expense")
  const paymentRows = rows.filter((row) => row.entryKind === "payment")
  const ignoredRows = rows.filter((row) => row.postingStatus === "ignored")
  const totalSelfNet = roundMoney(rows.reduce((sum, row) => sum + row.selfNet, 0))

  return {
    headers,
    participants,
    rows,
    currencies: Array.from(currencySet),
    suggestedSelfParticipant,
    summary: {
      rowCount: rows.length,
      expenseCount: expenseRows.length,
      paymentCount: paymentRows.length,
      ignoredCount: ignoredRows.length,
      totalCost: roundMoney(expenseRows.reduce((sum, row) => sum + row.cost, 0)),
      totalSelfShare: roundMoney(expenseRows.reduce((sum, row) => sum + row.selfShare, 0)),
      totalSelfNet,
      settled: Math.abs(totalSelfNet) < MONEY_TOLERANCE,
    },
  }
}
