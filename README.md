# Grov

Personal finance web app: accounts, transactions, reports, trips, and investments. Built with **Next.js** (App Router), **Clerk** for authentication, and **Supabase** (Postgres + Row Level Security) for data.

**Live app:** [www.grov-finance.com](https://www.grov-finance.com/)

## Features

- **Dashboard** — Spending, net worth, recent activity  
- **Accounts** — Asset and liability accounts with balances  
- **Transactions** — Income, expenses, transfers (optional UI flag via env)  
- **Investments** — Portfolio views and related tooling  
- **Reports** — Period overview, cash flow, spending, and income with category drill-downs
- **Trips** — Trip tracking linked to transactions  

Sign-in and sign-up are public; all other routes require an authenticated Clerk user.

## Tech stack

| Layer | Choice |
|--------|--------|
| Framework | [Next.js 16](https://nextjs.org) (React 19, App Router) |
| Auth | [Clerk](https://clerk.com) |
| Database | [Supabase](https://supabase.com) (Postgres, RLS) |
| UI | Tailwind CSS 4, Radix UI, shadcn-style components, Recharts, Mermaid |

## Prerequisites

- **Node.js** 20+ (matches `engines` if you add one; LTS recommended)  
- **npm** (or pnpm/yarn if you prefer)  
- A **Clerk** application  
- A **Supabase** project with schema applied from this repo’s migrations  

## Environment variables

Create a `.env.local` in the project root (never commit secrets). Typical variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk browser SDK |
| `CLERK_SECRET_KEY` | Yes | Clerk server / middleware |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_KEY` | Yes | Supabase anon key (used with Clerk JWT in `ssr/client.ts`) |
| `SUPABASE_SERVICE_ROLE_KEY` | For server-only admin paths | Used in `ssr/admin.ts` when present |
| `NEXT_PUBLIC_TRANSACTIONS_REDESIGN` | No | Set to `"0"` to disable the transactions redesign |
| `INVESTMENTS_CRON_SECRET` or `CRON_SECRET` | For cron API routes | Secures `/api/cron/...` and related refresh routes |

Clerk’s dashboard lists the exact publishable/secret key names if yours differ slightly.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to sign-in when visiting protected pages.

Other scripts:

```bash
npm run build   # production build
npm run start   # run production server locally
npm run lint    # ESLint
```

## Database

SQL migrations live under [`supabase/migrations/`](supabase/migrations/). Apply them to your Supabase database (CLI, dashboard SQL, or CI) so the app schema matches the code.

The paginated transaction ledger requires `20261031192259_transaction_ledger_pagination.sql` before deploying the app. It adds user/date and user/account/date indexes and the `get_transaction_ledger` read RPC. The RPC runs with the caller's permissions, uses the Clerk JWT subject, and retains transaction RLS. It returns up to 50 rows per request while computing count and financial summaries over all matching transactions in the same database statement.

Filters and sorting run in Postgres. Search is debounced by 250 ms; changing a filter resets to page one. Pages are stored in the URL for Back/Forward navigation. Offset pagination supports direct page links; very deep pages still scan skipped matching rows. Concurrent inserts/deletes between page requests can shift page boundaries; each individual page and its totals share one statement snapshot.

`npm test` includes an isolated PGlite database test of the migration, pagination beyond 1,000 rows, literal searches, financial summaries, index availability, and RLS. It does not connect to or modify the hosted database. The migration has to be applied by the database owner before live pagination browser verification.

Supabase is accessed from the server using a client that passes the Clerk session token (`ssr/client.ts`), so RLS policies should key off the same user identity your migrations expect (e.g. JWT `sub`).

## Project layout (high level)

Workspace pages use `components/page-layout.tsx` for a consistent header and content width. Reports and Investments share `components/section-tabs.tsx`; reports and portfolio summaries share `components/metric-strip.tsx`. Report totals and trends are calculated in `lib/report-summary.ts` so the overview and detail pages use the same definitions.

| Path | Role |
|------|------|
| `app/` | Routes, layouts, `data-context`, API routes |
| `components/` | UI and feature components |
| `lib/` | Server helpers (accounts, transactions, categories, etc.) |
| `ssr/` | Supabase client factories |
| `middleware.ts` | Clerk auth; public routes: `/sign-in`, `/sign-up` |

## Deploy

Deploy like any Next.js app (e.g. [Vercel](https://vercel.com)): set the same environment variables in the host dashboard, connect your repo, and run `npm run build` as the build command.

---

Grov — *Grov Finance Manager*
