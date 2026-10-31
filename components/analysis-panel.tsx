import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function AnalysisPanel({ title, description, action, children, className }: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card", className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 p-5 sm:p-6">{children}</div>
    </section>
  )
}
