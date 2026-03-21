"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { createEquityGrant, deleteEquityGrant, getEquityGrants, updateEquityGrant } from '@/lib/investments/equity'
import type { EquityGrant } from '@/lib/investments/types'

interface GrantFormState {
  company_name: string
  grant_name: string
  symbol: string
  total_shares: string
  vested_shares: string
  unvested_shares: string
  grant_date: string
  notes: string
}

function getInitialGrantForm(grant?: EquityGrant | null): GrantFormState {
  return {
    company_name: grant?.company_name ?? '',
    grant_name: grant?.grant_name ?? '',
    symbol: grant?.symbol ?? '',
    total_shares: grant ? String(grant.total_shares) : '0',
    vested_shares: grant ? String(grant.vested_shares) : '0',
    unvested_shares: grant ? String(grant.unvested_shares) : '0',
    grant_date: grant?.grant_date ?? '',
    notes: grant?.notes ?? '',
  }
}

function parseNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Shares must be zero or greater')
  }
  return parsed
}

export function InvestmentsEquityShell() {
  const [grants, setGrants] = useState<EquityGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGrant, setEditingGrant] = useState<EquityGrant | null>(null)
  const [deletingGrant, setDeletingGrant] = useState<EquityGrant | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<GrantFormState>(getInitialGrantForm())

  const loadGrants = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await getEquityGrants()
      setGrants(rows)
    } catch (loadError) {
      console.error('Failed to load equity grants:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load equity grants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGrants()
  }, [loadGrants])

  const totals = useMemo(() => {
    return grants.reduce(
      (acc, grant) => {
        acc.total += grant.total_shares
        acc.vested += grant.vested_shares
        acc.unvested += grant.unvested_shares
        return acc
      },
      { total: 0, vested: 0, unvested: 0 },
    )
  }, [grants])

  const openCreateDialog = () => {
    setEditingGrant(null)
    setForm(getInitialGrantForm())
    setDialogOpen(true)
  }

  const openEditDialog = (grant: EquityGrant) => {
    setEditingGrant(grant)
    setForm(getInitialGrantForm(grant))
    setDialogOpen(true)
  }

  const updateField = <K extends keyof GrantFormState>(key: K, value: GrantFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveGrant = async () => {
    if (!form.company_name.trim()) {
      toast.error('Company name is required')
      return
    }

    if (!form.grant_name.trim()) {
      toast.error('Grant name is required')
      return
    }

    try {
      setSaving(true)

      const payload = {
        company_name: form.company_name.trim(),
        grant_name: form.grant_name.trim(),
        symbol: form.symbol.trim() ? form.symbol.trim().toUpperCase() : null,
        total_shares: parseNumber(form.total_shares),
        vested_shares: parseNumber(form.vested_shares),
        unvested_shares: parseNumber(form.unvested_shares),
        grant_date: form.grant_date || null,
        notes: form.notes.trim() || null,
      }

      if (editingGrant) {
        await updateEquityGrant(editingGrant.id, payload)
        toast.success('Equity grant updated')
      } else {
        await createEquityGrant(payload)
        toast.success('Equity grant added')
      }

      setDialogOpen(false)
      setEditingGrant(null)
      await loadGrants()
    } catch (saveError) {
      console.error('Failed to save equity grant:', saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to save equity grant')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGrant = async () => {
    if (!deletingGrant) return

    try {
      await deleteEquityGrant(deletingGrant.id)
      toast.success('Equity grant deleted')
      setDeletingGrant(null)
      await loadGrants()
    } catch (deleteError) {
      console.error('Failed to delete equity grant:', deleteError)
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete equity grant')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-[360px]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Equity compensation</CardTitle>
            <p className="text-sm text-muted-foreground">
              Skeleton model for company grants. Future work will add vesting schedules, events, and tax treatment.
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add grant
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Total shares</p>
              <p className="text-2xl font-semibold">{totals.total.toLocaleString('en-CA')}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Vested shares</p>
              <p className="text-2xl font-semibold text-primary">{totals.vested.toLocaleString('en-CA')}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Unvested shares</p>
              <p className="text-2xl font-semibold">{totals.unvested.toLocaleString('en-CA')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grant</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Symbol</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vested</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unvested</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grant date</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={8}>
                  No equity grants yet. Add your first grant to start tracking vested/unvested shares.
                </td>
              </tr>
            ) : (
              grants.map((grant) => (
                <tr key={grant.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{grant.company_name}</td>
                  <td className="px-3 py-3">{grant.grant_name}</td>
                  <td className="px-3 py-3">{grant.symbol ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{grant.total_shares.toLocaleString('en-CA')}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{grant.vested_shares.toLocaleString('en-CA')}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{grant.unvested_shares.toLocaleString('en-CA')}</td>
                  <td className="px-3 py-3">{grant.grant_date ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEditDialog(grant)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setDeletingGrant(grant)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{editingGrant ? 'Edit equity grant' : 'Add equity grant'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="equity-company">Company</Label>
              <Input id="equity-company" value={form.company_name} onChange={(event) => updateField('company_name', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equity-grant-name">Grant name</Label>
              <Input id="equity-grant-name" value={form.grant_name} onChange={(event) => updateField('grant_name', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equity-symbol">Symbol (optional)</Label>
              <Input id="equity-symbol" value={form.symbol} onChange={(event) => updateField('symbol', event.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equity-grant-date">Grant date</Label>
              <Input id="equity-grant-date" type="date" value={form.grant_date} onChange={(event) => updateField('grant_date', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equity-total">Total shares</Label>
              <Input id="equity-total" type="number" min="0" step="0.000001" value={form.total_shares} onChange={(event) => updateField('total_shares', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equity-vested">Vested shares</Label>
              <Input id="equity-vested" type="number" min="0" step="0.000001" value={form.vested_shares} onChange={(event) => updateField('vested_shares', event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="equity-unvested">Unvested shares</Label>
              <Input id="equity-unvested" type="number" min="0" step="0.000001" value={form.unvested_shares} onChange={(event) => updateField('unvested_shares', event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="equity-notes">Notes</Label>
              <textarea
                id="equity-notes"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSaveGrant()} disabled={saving}>{saving ? 'Saving...' : editingGrant ? 'Save changes' : 'Add grant'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingGrant)} onOpenChange={(open) => !open && setDeletingGrant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete equity grant?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the selected equity grant record.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingGrant(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDeleteGrant()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
