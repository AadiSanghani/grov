import { Skeleton } from '@/components/ui/skeleton'

export default function InvestmentsLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-[360px]" />
      <Skeleton className="h-[420px]" />
    </div>
  )
}
