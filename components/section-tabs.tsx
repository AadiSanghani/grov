"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export interface SectionTab {
  label: string
  href: string
}

export function SectionTabs({ tabs, label }: { tabs: readonly SectionTab[]; label: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto border-b">
      <div className="flex min-w-max gap-6">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative border-b-2 px-0.5 pb-3 pt-1 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
