import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageLayoutProps {
  /** Page title (rendered as h1 with consistent typography) */
  title?: string
  /** Optional subtext under the title */
  description?: string
  /** Optional primary action, aligned right on sm+ */
  action?: ReactNode
  children: ReactNode
  /** Optional extra class for the inner content wrapper */
  contentClassName?: string
}

export function PageLayout({
  title,
  description,
  action,
  children,
  contentClassName,
}: PageLayoutProps) {
  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-background md:min-h-svh">
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] min-w-0 max-w-[1600px] md:min-h-svh flex-col gap-6 px-4 py-6 sm:px-6 md:py-8 lg:gap-8 lg:px-10">
        {(title || description || action) && (
          <header className="flex shrink-0 flex-col items-start justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
            {(title || description) && (
              <div className="min-w-0">
                {title && (
                  <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
                )}
                {description && (
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            )}
            {action && <div className="flex max-w-full flex-wrap items-center gap-2 sm:shrink-0">{action}</div>}
          </header>
        )}
        <section
          aria-label={title ? `${title} content` : "Page content"}
          className={cn("min-w-0", contentClassName ?? "flex flex-col gap-6")}
        >
          {children}
        </section>
      </div>
    </div>
  )
}
