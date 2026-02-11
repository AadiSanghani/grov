import * as React from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface DashboardCardProps extends Omit<React.ComponentProps<typeof Card>, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export function DashboardCard({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: DashboardCardProps) {
  return (
    <Card className={cn("gap-0 py-0", className)} {...props}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 pb-2.5!">
        <CardTitle className="text-lg font-semibold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="w-full">{description}</CardDescription>
        ) : null}
        {actions ? <div className="flex shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className="px-4 pt-2 pb-3">{children}</CardContent>
    </Card>
  )
}

