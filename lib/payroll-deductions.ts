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
