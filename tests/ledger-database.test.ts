// @vitest-environment node
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

interface DatabasePage {
  transactions: { id: number; amount: number; date: string; account_type_id: number | null }[]
  page: number
  pageSize: number
  totalCount: number
  summary: { totalIncome: number; totalSpending: number; net: number }
}

let database: PGlite
async function ledger(filters = {}, page = 1, size = 50) {
  const response = await database.query<{ result: DatabasePage }>(
    "select public.get_transaction_ledger($1::jsonb, $2, $3) as result",
    [JSON.stringify(filters), page, size]
  )
  return response.rows[0].result
}

beforeAll(async () => {
  database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema public, auth to authenticated;
    create table public.transactions (
      id bigint primary key, user_id text not null, transaction_type text,
      amount numeric, merchant text, date date, account_type_id integer,
      category text, notes text, created_at timestamptz, updated_at timestamptz,
      spending_amount numeric, incoming_subtype text
    );
    alter table public.transactions enable row level security;
    create policy owner_only on public.transactions for select
      using (user_id = (select auth.jwt() ->> 'sub'));
    grant select on public.transactions to authenticated;
    insert into public.transactions
      (id, user_id, transaction_type, amount, merchant, date, account_type_id, category, notes, spending_amount, created_at)
    select identifier, 'user-a', 'outgoing', 10, 'Coffee', '2026-10-01',
      case when identifier % 3 = 0 then null else 1 end,
      'Dining Out', case when identifier = 1 then 'literal 50%_ (A,B)' else 'shared lunch' end,
      2, '2026-10-01' from generate_series(1, 1037) identifier;
    insert into public.transactions
      (id, user_id, transaction_type, amount, merchant, date, account_type_id, category, spending_amount, incoming_subtype, created_at)
    values
      (2001, 'user-a', 'incoming', 200, 'Salary', '2026-10-15', 1, 'paychecks', null, 'income', '2026-10-15'),
      (2002, 'user-a', 'incoming', 99, 'Refund', '2026-10-15', 1, 'expense-reimbursement', null, null, '2026-10-15'),
      (2003, 'user-a', 'transfer', 1000, 'Transfer', '2026-10-15', 1, 'transfer', null, null, '2026-10-15'),
      (2004, 'user-a', 'outgoing', 100, 'Dinner', '2026-10-15', null, 'Dining Out', 25, null, '2026-10-15'),
      (3000, 'user-b', 'incoming', 99999, 'Private', '2026-10-15', 1, 'paychecks', null, 'income', '2026-10-15');
  `)
  await database.exec(await readFile(new URL("../supabase/migrations/20261031192259_transaction_ledger_pagination.sql", import.meta.url), "utf8"))
  await database.exec(`analyze public.transactions; set role authenticated; set request.jwt.claims = '{"sub":"user-a"}';`)
}, 20000)

afterAll(async () => { await database?.close() })

describe("indexed transaction ledger database", () => {
  it("bounds rows while retaining whole-result financial totals", async () => {
    const first = await ledger()
    const second = await ledger({}, 2)
    expect(first.transactions).toHaveLength(50)
    expect(first.totalCount).toBe(1041)
    expect(first.summary).toMatchObject({ totalIncome: 200, totalSpending: 2099, net: -1899 })
    expect(second.summary).toEqual(first.summary)
    expect(new Set([...first.transactions, ...second.transactions].map(row => row.id)).size).toBe(100)
  })

  it("visits every row beyond the API default cap with deterministic ties", async () => {
    const identifiers: number[] = []
    for (let page = 1; page <= 21; page++) {
      identifiers.push(...(await ledger({}, page)).transactions.map(row => row.id))
    }
    expect(identifiers).toHaveLength(1041)
    expect(new Set(identifiers).size).toBe(1041)
    expect(identifiers.slice(0, 4)).toEqual([2004, 2003, 2002, 2001])
  })

  it("combines assigned and unassigned accounts, category aliases, dates and amounts", async () => {
    const result = await ledger({ accounts: ["1", "__unassigned__"], categories: ["dining-out"], from: "2026-10-01", to: "2026-10-15", min: 10, max: 100 })
    expect(result.totalCount).toBe(1038)
    expect(result.summary.totalSpending).toBe(2099)
    expect((await ledger({ accounts: ["__unassigned__"], min: 100 })).transactions.map(row => row.id)).toEqual([2004])
    expect((await ledger({ accounts: ["invalid", "999999999999999999"] })).totalCount).toBe(0)
  })

  it("treats punctuation and SQL wildcard characters as literal search text", async () => {
    expect((await ledger({ search: "50%_" })).transactions.map(row => row.id)).toEqual([1])
    expect((await ledger({ search: "a,b" })).transactions.map(row => row.id)).toEqual([1])
    expect((await ledger({ search: "DINING OUT" })).totalCount).toBe(1038)
  })

  it("sorts all results before paging and clamps deleted or invalid pages", async () => {
    expect((await ledger({ sort: "amount", order: "desc" })).transactions[0].id).toBe(2003)
    expect((await ledger({ sort: "merchant", order: "asc" })).transactions[0].id).toBe(1037)
    expect((await ledger({ search: "Salary" }, 99)).page).toBe(1)
    expect((await ledger({}, 999)).page).toBe(21)
    expect((await ledger({}, -1, 999)).transactions).toHaveLength(100)
    expect((await ledger({ search: "missing" }, 99)).summary).toMatchObject({ totalIncome: 0, totalSpending: 0, net: 0 })
  })

  it("uses caller identity and RLS for both rows and aggregates", async () => {
    try {
      await database.exec(`set request.jwt.claims = '{"sub":"user-b"}';`)
      const other = await ledger({ user_id: "user-a" })
      expect(other.transactions.map(row => row.id)).toEqual([3000])
      expect(other.summary.totalIncome).toBe(99999)
      await database.exec(`set request.jwt.claims = '{}';`)
      expect((await ledger()).totalCount).toBe(0)
      await database.exec("set role anon")
      await expect(ledger()).rejects.toThrow(/permission denied/)
    } finally {
      await database.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"user-a"}';`)
    }
  })

  it("provides the ordered user index for bounded recent reads", async () => {
    await database.exec("set enable_seqscan = off")
    try {
      const plan = await database.query(`explain select * from public.transactions
        where user_id = 'user-a' order by date desc nulls last, created_at desc nulls last, id desc limit 50`)
      expect(JSON.stringify(plan.rows)).toContain("transactions_user_date_ledger_idx")
    } finally {
      await database.exec("reset enable_seqscan")
    }
  })
})
