"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { TransactionFilters } from "@/lib/types"
import { parseFilters, serializeFilters } from "@/lib/ledger/filters"
import { normalizeLedgerPage } from "@/lib/ledger/pagination"

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
  const page = normalizeLedgerPage(new URLSearchParams(query).get("page"))
  const setFilters = useCallback((next: TransactionFilters) => {
    const existing = new URLSearchParams(window.location.search)
    existing.delete("page")
    const params = serializeFilters(next, existing.toString())
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
  const setPage = useCallback((next: number) => {
    const params = new URLSearchParams(window.location.search)
    const value = normalizeLedgerPage(next)
    if (value === 1) params.delete("page")
    else params.set("page", String(value))
    const search = params.toString()
    const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
    window.history.pushState(null, "", url)
    window.dispatchEvent(new Event(changed))
  }, [])
  return [filters, setFilters, { page, setPage }] as const
}
