import Link from "next/link"

export const metadata = {
  title: "Privacy | Grov",
  description: "How Grov handles your sign-in details, financial records, and browser preferences.",
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-10 sm:py-16">
      <Link href="/" className="text-sm underline underline-offset-4">Back to Grov</Link>
      <header className="mt-10 border-b pb-6">
        <h1 className="font-serif text-5xl tracking-tight">Privacy at Grov</h1>
        <p className="mt-4 leading-7">Here’s what happens to the information you enter when you track your finances with Grov.</p>
      </header>
      <div className="mt-8 space-y-8 leading-7 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold">
        <section>
          <h2>Sign-in and cookies</h2>
          <p>Clerk handles sign-in and uses cookies to keep you signed in. Grov uses your account ID to load your workspace. A separate cookie remembers whether you left the sidebar open or closed.</p>
        </section>
        <section>
          <h2>Your financial records</h2>
          <p>Grov stores the accounts, balances, transactions, and investment trades you enter in Supabase. It uses those records to calculate your net worth, summarize spending, and track your portfolio. If you import shared trip expenses, the records can include other participants’ names and their share of each expense.</p>
        </section>
        <section>
          <h2>Market prices and exchange rates</h2>
          <p>Grov sends ticker symbols and currency pairs to Yahoo Finance to look up prices and exchange rates. Grov then uses those rates to value your holdings.</p>
        </section>
        <section>
          <h2>Managing your information</h2>
          <p>You can review, edit, or delete individual transactions from the Transactions page. To manage your sign-in details or sign out on a shared device, open your profile menu in the sidebar.</p>
        </section>
      </div>
    </article>
  )
}
