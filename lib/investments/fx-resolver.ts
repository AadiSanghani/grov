/** Each valuation owns its resolver; never share currency rates across requests. */
export function createFxToCadResolver(
  prefetchedByCurrency: Map<string, Map<string, number>>,
  fetchRate: (from: string, to: string, date: string) => Promise<number>,
): (currency: string, date: string) => Promise<number> {
  const inFlight = new Map<string, Promise<number>>()
  return async (currency, date) => {
    const normalizedCurrency = currency.trim().toUpperCase()
    if (normalizedCurrency === 'CAD') return 1
    const key = `${normalizedCurrency}:CAD:${date}`
    const existing = inFlight.get(key)
    if (existing) return existing
    const prefetched = prefetchedByCurrency.get(normalizedCurrency)?.get(date)
    if (prefetched != null) return prefetched
    const pending = fetchRate(normalizedCurrency, 'CAD', date)
    inFlight.set(key, pending)
    return pending
  }
}
