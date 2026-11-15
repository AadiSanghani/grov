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
      description="Your balances, spending, and recent activity in one place"
    >
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardNetWorthSection searchParams={resolvedSearchParams} />
        <DashboardSpendingSection searchParams={resolvedSearchParams} />
      </div>
      <DashboardRecentTransactionsSection />
    </PageLayout>
  )
}
