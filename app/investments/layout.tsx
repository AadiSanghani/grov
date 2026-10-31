"use client"

import { PageLayout } from '@/components/page-layout'
import { SectionTabs } from '@/components/section-tabs'

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
  return (
    <PageLayout title="Investments" description="Track your portfolio, allocation, and realized performance.">
      <SectionTabs tabs={TABS} label="Investments sections" />
      {children}
    </PageLayout>
  )
}
