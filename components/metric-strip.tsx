import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface Metric {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: "positive" | "negative"
}

export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-xl border bg-border", metrics.length >= 2 && "sm:grid-cols-2", metrics.length >= 4 && "xl:grid-cols-4", metrics.length === 3 && "lg:grid-cols-3", className)}>
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 bg-card px-5 py-4 sm:px-6 sm:py-5">
          <dt className="text-sm font-medium text-muted-foreground">{metric.label}</dt>
          <dd className={cn("mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums", metric.tone === "positive" && "text-positive", metric.tone === "negative" && "text-negative")}>
            {metric.value}
          </dd>
          {metric.detail && <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
