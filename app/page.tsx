import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { PocketLanding } from "@/components/landing/pocket-landing"

export const metadata = {
  title: "Grov — Small change. Big picture.",
  description: "See what you own, what you owe, and where your money goes. Explore your transactions, spending, trips, and investments with Grov.",
}

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await auth()
  if (userId) {
    const query = new URLSearchParams()
    for (const [key, values] of Object.entries(await searchParams)) {
      if (values !== undefined) {
        for (const value of Array.isArray(values) ? values : [values]) query.append(key, value)
      }
    }
    redirect(query.size ? `/dashboard?${query}` : "/dashboard")
  }
  return <PocketLanding />
}
