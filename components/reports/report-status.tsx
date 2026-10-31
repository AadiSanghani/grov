import { Button } from "@/components/ui/button"

export function ReportStatus({ loading, error, loadedPeriod, onRetry }: {
  loading: boolean
  error: string | null
  loadedPeriod: string | null
  onRetry: () => void
}) {
  if (!loading && !error) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm">
      {loading && <p role="status" className="text-muted-foreground">Updating report…</p>}
      {loadedPeriod && <p className="text-muted-foreground">Showing previously loaded data: {loadedPeriod}.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {error && <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>Retry</Button>}
    </div>
  )
}
