import type { ReactNode } from "react"

interface PageLayoutProps {
  /** Page title (rendered as h1 with consistent typography) */
  title?: string
  /** Optional subtext under the title */
  description?: string
  /** Optional primary action (e.g. Add transaction button) - aligned right on sm+ */
  action?: ReactNode
  /** Page content */
  children: ReactNode
  /** Optional extra class for the inner content wrapper (e.g. flex-1 for transactions) */
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
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-6 p-6">
        {(title ?? action) && (
          <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center shrink-0">
            {(title ?? description) && (
              <div>
                {title && (
                  <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                )}
                {description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            )}
            {action && <div className="shrink-0">{action}</div>}
          </header>
        )}
        <section
          aria-label={title ? `${title} content` : "Page content"}
          className={contentClassName ?? "flex flex-col gap-6"}
        >
          {children}
        </section>
      </div>
    </div>
  )
}
