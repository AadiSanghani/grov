import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function RealizedPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Realized Gains</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Realized gains/losses with account, ticker, and date range filters will be added next.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
