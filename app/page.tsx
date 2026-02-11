export const dynamic = "force-dynamic"

import { PageLayout } from "@/components/page-layout"
import { DashboardSpendingSection } from "@/components/dashboard/spending-section"
import { DashboardNetWorthSection } from "@/components/dashboard/net-worth-section"
import { DashboardRecentTransactionsSection } from "@/components/dashboard/recent-transactions-section"

type ResolvedSearchParams = Record<string, string | string[] | undefined>

interface HomePageProps {
  searchParams?: ResolvedSearchParams | Promise<ResolvedSearchParams>
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined

  return (
    <PageLayout
      title="Dashboard"
      description="High-level view of your spending, accounts, and recent activity."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardSpendingSection searchParams={resolvedSearchParams} />
        <DashboardNetWorthSection searchParams={resolvedSearchParams} />
      </div>
      <DashboardRecentTransactionsSection />
    </PageLayout>
  )
}
