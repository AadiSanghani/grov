/**
 * Consume ordered Supabase pages on the server. Advance by the last returned row,
 * not the requested size: projects can configure a row cap below our page size.
 * Only an empty page means EOF. Errors must never become partial financial data.
 * The caller must filter strictly after that cursor in a stable, unique order,
 * and retain its user filter. Keyset reads avoid ever-growing OFFSET scans.
 */
export async function* readPages<T>(
  read: (after: T | undefined, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
): AsyncGenerator<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size')
  let after: T | undefined
  while (true) {
    const { data, error } = await read(after, pageSize)
    if (error) throw error
    if (!data) throw new Error('Missing data while reading history')
    if (data.length === 0) return
    yield data
    after = data[data.length - 1]
  }
}
