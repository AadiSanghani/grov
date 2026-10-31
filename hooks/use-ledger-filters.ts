"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { TransactionFilters } from "@/lib/types"
import { parseFilters, serializeFilters } from "@/lib/ledger/filters"

const changed = "ledger-filters-changed"
function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback)
  window.addEventListener(changed, callback)
  return () => {
    window.removeEventListener("popstate", callback)
    window.removeEventListener(changed, callback)
  }
}
const snapshot = () => window.location.search
const serverSnapshot = () => ""

export function useLedgerFilters() {
  const query = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const filters = useMemo(() => parseFilters(query), [query])
  const setFilters = useCallback((next: TransactionFilters) => {
    const params = serializeFilters(next, window.location.search)
    const url = `${window.location.pathname}${params ? `?${params}` : ""}${window.location.hash}`
    if (
      url ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    )
      return
    // Native history preserves the ledger and scroll; Next also observes these updates.
    window.history.pushState(null, "", url)
    window.dispatchEvent(new Event(changed))
  }, [])
  return [filters, setFilters] as const
}
