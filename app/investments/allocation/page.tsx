import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AllocationPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Allocation by asset type, currency, and account will be available once holdings valuation is connected.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
