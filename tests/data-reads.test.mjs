// Run with Node >= 22.6: node --experimental-strip-types --test tests/data-reads.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNetWorthSweep } from '../lib/net-worth-history.ts'
import { readPages } from '../lib/read-pages.ts'
import { recentTransactionsQuery } from '../lib/transaction-reads.ts'
import { createFxToCadResolver } from '../lib/investments/fx-resolver.ts'

const accounts = [
  { id: 1, category: 'asset' },
  { id: 2, category: 'liability' },
  // Archived accounts remain in the category map and contribute their history.
  { id: 3, category: 'asset', is_archived: true },
]
const rows = [
  { account_id: 1, date: '2024-12-01', balance_amount: '1000.25' },
  { account_id: 2, date: '2024-12-02', balance_amount: '300.50' },
  { account_id: 3, date: '2024-12-03', balance_amount: '50' },
  { account_id: 1, date: '2025-01-02', balance_amount: '1100.25' },
  { account_id: 2, date: '2025-01-02', balance_amount: '200.50' },
  { account_id: 1, date: '2025-01-15', balance_amount: '-25.75' },
  { account_id: 2, date: '2025-02-10', balance_amount: '-10.50' },
  { account_id: 1, date: '2025-02-15', balance_amount: '74.25' },
]

function sweep(input, granularity = 'daily', pageSize = 1, start = '2025-01-01', end = '2025-02-28') {
  const calculation = createNetWorthSweep(accounts, start, end, granularity)
  for (let i = 0; i < input.length; i += pageSize) calculation.push(input.slice(i, i + pageSize))
  return calculation.finish()
}

// Reference implementation intentionally rescans to assert the prior semantics.
function reference(input, granularity, start, end) {
  const dates = [...new Set(input.map((row) => row.date))].filter((date) => date >= start && date <= end).sort()
  const snapshots = new Map()
  for (const date of dates) {
    let assets = 0
    let liabilities = 0
    for (const account of accounts) {
      const history = input.filter((row) => row.account_id === account.id && row.date <= date)
      const amount = Number(history.at(-1)?.balance_amount ?? 0)
      if (account.category === 'asset') assets += amount
      if (account.category === 'liability') liabilities += amount
    }
    const key = granularity === 'daily' ? date : date.slice(0, 7)
    snapshots.set(key, { date: key, total_assets: assets, total_liabilities: liabilities, net_worth: assets - liabilities })
  }
  return [...snapshots.values()]
}

test('carry-forward, opening balances, archived assets and liability signs survive page boundaries', () => {
  assert.deepEqual(sweep(rows), [
    { date: '2025-01-02', total_assets: 1150.25, total_liabilities: 200.50, net_worth: 949.75 },
    { date: '2025-01-15', total_assets: 24.25, total_liabilities: 200.50, net_worth: -176.25 },
    { date: '2025-02-10', total_assets: 24.25, total_liabilities: -10.50, net_worth: 34.75 },
    { date: '2025-02-15', total_assets: 124.25, total_liabilities: -10.50, net_worth: 134.75 },
  ])
  for (const granularity of ['daily', 'monthly']) {
    for (const pageSize of [1, 2, 3, 500]) {
      assert.deepEqual(sweep(rows, granularity, pageSize), reference(rows, granularity, '2025-01-01', '2025-02-28'))
    }
  }
})

test('month snapshots use the last recorded in-range date, including a partial final month', () => {
  assert.deepEqual(sweep(rows, 'monthly', 2, '2025-01-10', '2025-02-11'), [
    { date: '2025-01', total_assets: 24.25, total_liabilities: 200.50, net_worth: -176.25 },
    { date: '2025-02', total_assets: 24.25, total_liabilities: -10.50, net_worth: 34.75 },
  ])
})

test('empty history, pre-period-only history, new accounts and unrecognized accounts preserve date semantics', () => {
  assert.deepEqual(sweep([]), [])
  assert.deepEqual(sweep(rows.slice(0, 3)), [])
  assert.deepEqual(sweep([{ account_id: 1, date: '2025-01-20', balance_amount: 10 }]), [
    { date: '2025-01-20', total_assets: 10, total_liabilities: 0, net_worth: 10 },
  ])
  assert.deepEqual(sweep([{ account_id: 999, date: '2025-01-20', balance_amount: 10 }]), [
    { date: '2025-01-20', total_assets: 0, total_liabilities: 0, net_worth: 0 },
  ])
  assert.throws(() => sweep([...rows].reverse()), /ordered/)
})

test('large histories match the old calculation while visiting each balance only once', () => {
  const history = Array.from({ length: 2400 }, (_, i) => ({
    account_id: i % 3 + 1,
    date: new Date(Date.UTC(2023, 0, 1 + Math.floor(i / 3))).toISOString().slice(0, 10),
    balance_amount: ((i * 17) % 100000 - 3000) / 100,
  }))
  let reads = 0
  const measured = history.map((row) => ({ ...row, get balance_amount() { reads++; return row.balance_amount } }))
  for (const granularity of ['daily', 'monthly']) {
    reads = 0
    const result = sweep(measured, granularity, 137, '2024-01-01', '2025-02-28')
    const expected = reference(history, granularity, '2024-01-01', '2025-02-28')
    assert.equal(reads, history.length)
    assert.equal(result.length, expected.length)
    result.forEach((point, i) => {
      assert.equal(point.date, expected[i].date)
      for (const key of ['total_assets', 'total_liabilities', 'net_worth']) {
        assert.ok(Math.abs(point[key] - expected[i][key]) < 1e-8, `${point.date}: ${key}`)
      }
    })
  }
})

test('keyset paging traverses a server cap smaller than the requested page size, past 1000 rows', async () => {
  const input = Array.from({ length: 1203 }, (_, id) => ({ id }))
  const seen = []
  const cursors = []
  for await (const page of readPages(async (after, limit) => {
    cursors.push(after?.id)
    return { data: input.filter((row) => !after || row.id > after.id).slice(0, Math.min(limit, 97)), error: null }
  })) seen.push(...page)
  assert.deepEqual(seen, input)
  assert.equal(cursors[1], 96)
  assert.equal(cursors.at(-1), 1202)
})

test('history paging propagates failures instead of returning partial or zero history', async () => {
  let calls = 0
  const failure = new Error('Database unavailable')
  await assert.rejects(async () => {
    for await (const page of readPages(async () => ++calls === 1
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: failure })) assert.equal(page.length, 1)
  }, failure)
  await assert.rejects(async () => {
    for await (const page of readPages(async () => ({ data: null, error: null }))) assert.fail(`Unexpected page: ${page}`)
  }, /Missing data/)
})

test('recent activity filters the authenticated user and limits in the database after deterministic ordering', async () => {
  const calls = []
  const query = {}
  for (const method of ['from', 'select', 'eq', 'order', 'limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query }
  }
  recentTransactionsQuery(query, 'user-test')
  assert.deepEqual(calls, [
    ['from', 'transactions'], ['select', '*'], ['eq', 'user_id', 'user-test'],
    ['order', 'date', { ascending: false }], ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: false }], ['limit', 10],
  ])
})

test('concurrent CAD valuations reuse same-date FX, preserve historical rates and isolate new requests', async () => {
  const calls = []
  const fetchRate = async (...args) => { calls.push(args); return 1.42 }
  const prefetched = new Map([['USD', new Map([['2025-01-01', 1.35]])]])
  const resolve = createFxToCadResolver(prefetched, fetchRate)
  assert.equal(await resolve(' cad ', '2025-01-01'), 1)
  assert.equal(await resolve(' usd ', '2025-01-01'), 1.35)
  assert.equal(calls.length, 0)
  assert.deepEqual(await Promise.all([
    resolve('USD', '2025-01-02'), resolve(' usd ', '2025-01-02'), resolve('USD', '2025-01-02'),
  ]), [1.42, 1.42, 1.42])
  assert.deepEqual(calls, [['USD', 'CAD', '2025-01-02']])
  await resolve('USD', '2025-01-03')
  await createFxToCadResolver(prefetched, fetchRate)('USD', '2025-01-02')
  assert.equal(calls.length, 3)
})

test('failed FX does not masquerade as a zero CAD value', async () => {
  const resolve = createFxToCadResolver(new Map(), async () => { throw new Error('FX unavailable') })
  await assert.rejects(resolve('USD', '2025-01-02'), /FX unavailable/)
})

test('cent-denominated balances return exactly zero after fractional carry-forward changes', () => {
  const result = sweep([
    { account_id: 1, date: '2025-01-01', balance_amount: 0.10 },
    { account_id: 3, date: '2025-01-01', balance_amount: 0.20 },
    { account_id: 1, date: '2025-01-02', balance_amount: 0 },
    { account_id: 3, date: '2025-01-03', balance_amount: 0 },
  ])
  assert.equal(result[0].net_worth, 0.30)
  assert.equal(result.at(-1).net_worth, 0)
})

test('the real Supabase builder sends the bounded user-scoped recent activity query', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  let sentUrl
  const client = createClient('https://example.test', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url) => {
      sentUrl = new URL(url)
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
    } },
  })
  const { error } = await recentTransactionsQuery(client, 'user-test')
  assert.equal(error, null)
  assert.equal(sentUrl.pathname, '/rest/v1/transactions')
  assert.equal(sentUrl.searchParams.get('user_id'), 'eq.user-test')
  assert.equal(sentUrl.searchParams.get('order'), 'date.desc,created_at.desc,id.desc')
  assert.equal(sentUrl.searchParams.get('limit'), '10')
})
