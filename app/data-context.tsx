"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { type Merchant } from "@/lib/types"
import { getMerchants, createMerchant } from "@/lib/merchants"

export interface DataContextValue {
  merchants: Merchant[]
  loading: boolean
  addMerchant: (name: string) => Promise<Merchant>
}

const DataContext = createContext<DataContextValue | null>(null)

export function useDataContext() {
  const ctx = useContext(DataContext)
  if (!ctx) {
    throw new Error("useDataContext must be used within DataProvider")
  }
  return ctx
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [merchantsData] = await Promise.all([
          getMerchants(),
        ])
        setMerchants(merchantsData || [])
      } catch (error) {
        console.error("Failed to load data context:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const addMerchant = useCallback(async (name: string): Promise<Merchant> => {
    const newMerchant = await createMerchant(name)
    setMerchants((prev) => {
      if (prev.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        return prev
      }
      return [...prev, newMerchant].sort((a, b) => a.name.localeCompare(b.name))
    })
    return newMerchant
  }, [])

  const value = useMemo(
    () => ({
      merchants,
      loading,
      addMerchant,
    }),
    [merchants, loading, addMerchant]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
