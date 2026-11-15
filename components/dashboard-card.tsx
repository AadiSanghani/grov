import * as React from "react"

import {
  Card,
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
    <Card className={cn("gap-0 py-0 shadow-none", className)} {...props}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b px-5 py-4 pb-4! sm:px-6">
        <div className="min-w-0">
          <CardTitle className="text-base font-medium leading-6">{title}</CardTitle>
          {description ? <CardDescription className="mt-1 leading-5">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className="px-5 py-5 sm:px-6 sm:py-6">{children}</CardContent>
    </Card>
  )
}
