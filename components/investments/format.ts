export function formatCurrencyCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatSignedCad(amount: number): string {
  const formatted = formatCurrencyCad(Math.abs(amount))
  return `${amount >= 0 ? '+' : '-'}${formatted}`
}

export function formatSignedCurrency(amount: number, currency: string): string {
  const formatted = formatCurrency(Math.abs(amount), currency)
  return `${amount >= 0 ? '+' : '-'}${formatted}`
}
