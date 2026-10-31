'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardReadError({ title }: { title: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Card aria-busy={pending}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p role="alert" className="text-sm text-muted-foreground">Unable to load this data. Please try again.</p>
        <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
          {pending ? 'Retrying…' : 'Retry'}
        </Button>
      </CardContent>
    </Card>
  )
}
