export const dynamic = "force-dynamic"

import { DashboardSpendingSection } from "@/components/dashboard/spending-section"
import { DashboardNetWorthSection } from "@/components/dashboard/net-worth-section"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface HomePageProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-6 p-6">
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              High-level view of your spending, accounts, and recent activity.
            </p>
          </div>
        </header>

        <section
          aria-label="Dashboard overview"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <DashboardSpendingSection searchParams={resolvedSearchParams} />
          <DashboardNetWorthSection searchParams={resolvedSearchParams} />
        </section>
      </main>
    </div>
  )
}
