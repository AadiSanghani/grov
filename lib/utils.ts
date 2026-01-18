import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Category, CategoryGroup, CategoryItem } from "./categories"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
