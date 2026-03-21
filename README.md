# Grov

Personal finance web app: accounts, transactions, reports, trips, and investments. Built with **Next.js** (App Router), **Clerk** for authentication, and **Supabase** (Postgres + Row Level Security) for data.

**Live app:** [www.grov-finance.com](https://www.grov-finance.com/)

## Features

- **Dashboard** — Spending, net worth, recent activity  
- **Accounts** — Asset and liability accounts with balances  
- **Transactions** — Income, expenses, transfers (optional UI flag via env)  
- **Investments** — Portfolio views and related tooling  
- **Reports** — Cash flow, income, spending  
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

Supabase is accessed from the server using a client that passes the Clerk session token (`ssr/client.ts`), so RLS policies should key off the same user identity your migrations expect (e.g. JWT `sub`).

## Project layout (high level)

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
