"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Holdings", href: "/investments/holdings" },
  { label: "Allocation", href: "/investments/allocation" },
  { label: "Realized", href: "/investments/realized" },
  { label: "Transactions", href: "/investments/transactions" },
] as const

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-background">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Investments</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track holdings, allocations, realized gains, and transactions.
            </p>
          </div>
          <nav className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
