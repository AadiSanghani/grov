export const PAYROLL_DEDUCTION_LABELS = [
  "RRSP",
  "CPP",
  "FIT",
  "PIT",
  "EI",
  "LTD",
  "STD",
  "Critical Illness",
  "Optional Life",
  "AD&D",
  "Stock Offset",
] as const

export type PayrollDeductionLabel = (typeof PAYROLL_DEDUCTION_LABELS)[number]

export const TAX_PAYROLL_DEDUCTION_LABELS = ["CPP", "EI", "FIT", "PIT"] as const
export const INSURANCE_PAYROLL_DEDUCTION_LABELS = [
  "LTD",
  "STD",
  "Critical Illness",
  "Optional Life",
  "AD&D",
] as const

const TAX_PAYROLL_DEDUCTION_LABEL_SET = new Set<string>(TAX_PAYROLL_DEDUCTION_LABELS)
const INSURANCE_PAYROLL_DEDUCTION_LABEL_SET = new Set<string>(
  INSURANCE_PAYROLL_DEDUCTION_LABELS.map((label) => label.toUpperCase())
)

export function isTaxPayrollDeductionLabel(label: string | null | undefined): boolean {
  const normalizedLabel = (label ?? "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

  return TAX_PAYROLL_DEDUCTION_LABEL_SET.has(normalizedLabel)
}

export function isInsurancePayrollDeductionLabel(label: string | null | undefined): boolean {
  const normalizedLabel = (label ?? "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

  return INSURANCE_PAYROLL_DEDUCTION_LABEL_SET.has(normalizedLabel)
}
