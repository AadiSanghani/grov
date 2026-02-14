import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Category, CategoryGroup, CategoryItem } from "./categories"
import { Transaction } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toLocalDateString(date: Date): string {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0

  const year = isUtcMidnight ? date.getUTCFullYear() : date.getFullYear()
  const month = String((isUtcMidnight ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0')
  const day = String(isUtcMidnight ? date.getUTCDate() : date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeCalendarDate(date: Date): Date {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0

  const year = isUtcMidnight ? date.getUTCFullYear() : date.getFullYear()
  const month = isUtcMidnight ? date.getUTCMonth() : date.getMonth()
  const day = isUtcMidnight ? date.getUTCDate() : date.getDate()

  return new Date(year, month, day)
}

export function toDateOnlyString(input: Date | string): string {
  if (input instanceof Date) {
    return toLocalDateString(input)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${input}`)
  }

  return toLocalDateString(parsed)
}

export function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.slice(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)

  // Use noon UTC to keep the same calendar day when serialized across server/client time zones.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

/**
 * Converts a category name to a kebab-case value
 * e.g., "Paychecks" -> "paychecks", "Auto Payment" -> "auto-payment"
 */
export function categoryNameToValue(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

/**
 * Groups categories by their group_name and formats them for UI components
 * Compatible with the old hardcoded category structure
 */
export function formatCategoriesForUI(categories: Category[]): CategoryGroup[] {
  // Group categories by group_name
  const grouped = categories.reduce((acc, category) => {
    const groupName = category.group_name
    if (!acc[groupName]) {
      acc[groupName] = []
    }
    acc[groupName].push({
      value: categoryNameToValue(category.name),
      label: category.name,
      emoji: category.emoji,
    })
    return acc
  }, {} as Record<string, CategoryItem[]>)

  // Convert to array format
  return Object.entries(grouped).map(([group, items]) => ({
    group,
    items,
  }))
}

/**
 * Finds a specific category item by its value
 */
export function findCategoryByValue(
  categories: Category[],
  value: string
): CategoryItem | null {
  const formattedCategories = formatCategoriesForUI(categories)
  
  for (const group of formattedCategories) {
    const item = group.items.find((i) => i.value === value)
    if (item) return item
  }
  
  return null
}

/**
 * For outgoing transactions, returns spending_amount when set, otherwise amount.
 * For incoming transactions, always returns amount.
 * Use this everywhere spending/category totals are computed or displayed.
 */
export function getSpendingAmount(t: Transaction): number {
  if (t.transaction_type === 'outgoing' && t.spending_amount != null) {
    return t.spending_amount
  }
  return t.amount
}

// Account type classification
const ASSET_TYPES = ['Cash', 'Investments', 'Real Estate', 'Valuables', 'Other Assets']
const LIABILITY_TYPES = ['Credit Card', 'Mortgage', 'Loans', 'Vehicles', 'Other Liabilities']

/**
 * Determine if an account type is an asset or liability
 */
export function getCategoryFromAccountType(accountType: string): 'asset' | 'liability' {
  if (ASSET_TYPES.includes(accountType)) return 'asset'
  if (LIABILITY_TYPES.includes(accountType)) return 'liability'
  // Default to asset if unknown
  return 'asset'
}

/**
 * Calculate balance delta based on transaction type and account category.
 * 
 * Convention:
 * - Outgoing = money leaving (you spent/used money)
 * - Incoming = money coming in (you received money)
 * 
 * For Assets: outgoing = -amount, incoming = +amount
 * For Liabilities: outgoing = +amount (debt increases), incoming = -amount (debt decreases)
 */
export function calculateBalanceDelta(
  transactionType: 'outgoing' | 'incoming',
  amount: number,
  accountCategory: 'asset' | 'liability'
): number {
  if (accountCategory === 'asset') {
    // Assets: outgoing decreases, incoming increases
    return transactionType === 'incoming' ? amount : -amount
  } else {
    // Liabilities: outgoing increases (more debt), incoming decreases (paying off)
    return transactionType === 'outgoing' ? amount : -amount
  }
}
