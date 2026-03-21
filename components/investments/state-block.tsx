import { Button } from '@/components/ui/button'

interface StateBlockProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function InvestmentsStateBlock({
  title,
  description,
  actionLabel,
  onAction,
}: StateBlockProps) {
  return (
    <div className="rounded-lg border bg-card px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
