import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function HoldingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Holdings</h2>
          <p className="text-sm text-muted-foreground">
            Portfolio summary, performance chart, and holdings table.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Add transaction
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$0.00</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unrealized P/L</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$0.00</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Realized P/L</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$0.00</CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Performance chart and grouped holdings table will be wired in the next step.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
