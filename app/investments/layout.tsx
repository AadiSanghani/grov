"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Overview', href: '/investments' },
  { label: 'Allocation', href: '/investments/allocation' },
  { label: 'Realized P/L', href: '/investments/realized' },
  { label: 'Equity Compensation', href: '/investments/equity' },
] as const

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto w-full max-w-[1800px] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Investments</h1>
              <p className="text-sm text-muted-foreground">
                Portfolio dashboard powered by ledger-derived holdings and scheduled market sync.
              </p>
            </div>
            <nav className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1800px] flex-1 overflow-auto px-6 py-6">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  )
}
