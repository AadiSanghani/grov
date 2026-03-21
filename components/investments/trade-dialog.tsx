"use client"

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  createInvestmentTransaction,
  updateInvestmentTransaction,
} from '@/lib/investments/transactions'
import type {
  InvestmentAccount,
  InvestmentTransaction,
  InvestmentTransactionType,
} from '@/lib/investments/types'

interface TradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: InvestmentAccount[]
  transaction?: InvestmentTransaction | null
  onSaved: () => Promise<void> | void
}

interface TradeFormState {
  account_type_id: string
  ticker: string
  transaction_type: InvestmentTransactionType
  trade_date: string
  quantity: string
  unit_price: string
  fees: string
  trade_currency: string
  fx_rate_to_cad: string
  notes: string
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildInitialState(
  accounts: InvestmentAccount[],
  transaction?: InvestmentTransaction | null,
): TradeFormState {
  if (transaction) {
    return {
      account_type_id: transaction.account_type_id,
      ticker: transaction.security?.ticker ?? '',
      transaction_type: transaction.transaction_type,
      trade_date: transaction.trade_date,
      quantity: String(transaction.quantity),
      unit_price: String(transaction.unit_price),
      fees: String(transaction.fees),
      trade_currency: transaction.trade_currency,
      fx_rate_to_cad: transaction.fx_rate_to_cad != null ? String(transaction.fx_rate_to_cad) : '',
      notes: transaction.notes ?? '',
    }
  }

  return {
    account_type_id: accounts[0]?.id ?? '',
    ticker: '',
    transaction_type: 'BUY',
    trade_date: todayDateString(),
    quantity: '',
    unit_price: '',
    fees: '0',
    trade_currency: 'USD',
    fx_rate_to_cad: '',
    notes: '',
  }
}

function parseOptionalNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return value
}

export function InvestmentsTradeDialog({
  open,
  onOpenChange,
  accounts,
  transaction,
  onSaved,
}: TradeDialogProps) {
  const isEditing = Boolean(transaction)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<TradeFormState>(() => buildInitialState(accounts, transaction))

  const canSubmit = useMemo(() => {
    if (!form.account_type_id) return false
    if (!isEditing && !form.ticker.trim()) return false
    if (!form.trade_date) return false
    if (!form.quantity.trim()) return false
    if (!form.unit_price.trim()) return false
    if (!form.trade_currency.trim()) return false
    return true
  }, [form, isEditing])

  useEffect(() => {
    if (open) {
      setForm(buildInitialState(accounts, transaction))
    }
  }, [open, accounts, transaction])

  const setField = <K extends keyof TradeFormState>(key: K, value: TradeFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Please fill in all required fields')
      return
    }

    const quantity = Number(form.quantity)
    const unitPrice = Number(form.unit_price)
    const fees = Number(form.fees || '0')

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be greater than zero')
      return
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error('Unit price must be zero or greater')
      return
    }

    if (!Number.isFinite(fees) || fees < 0) {
      toast.error('Fees must be zero or greater')
      return
    }

    const fxRate = parseOptionalNumber(form.fx_rate_to_cad)
    if (form.fx_rate_to_cad.trim() && (fxRate == null || fxRate <= 0)) {
      toast.error('FX override must be greater than zero')
      return
    }

    try {
      setIsSaving(true)

      if (isEditing && transaction) {
        await updateInvestmentTransaction(transaction.id, {
          transaction_type: form.transaction_type,
          trade_date: form.trade_date,
          quantity,
          unit_price: unitPrice,
          fees,
          trade_currency: form.trade_currency,
          fx_rate_to_cad: fxRate,
          notes: form.notes,
        })
      } else {
        await createInvestmentTransaction({
          account_type_id: form.account_type_id,
          ticker: form.ticker,
          transaction_type: form.transaction_type,
          trade_date: form.trade_date,
          quantity,
          unit_price: unitPrice,
          fees,
          trade_currency: form.trade_currency,
          fx_rate_to_cad: fxRate,
          notes: form.notes,
        })
      }

      await onSaved()
      onOpenChange(false)
      toast.success(isEditing ? 'Trade updated' : 'Trade added')
    } catch (error) {
      console.error('Failed to save trade:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save trade')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit investment trade' : 'Add investment trade'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="investment-account">Account</Label>
            <Select
              value={form.account_type_id}
              onValueChange={(value) => setField('account_type_id', value)}
              disabled={isEditing}
            >
              <SelectTrigger id="investment-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-ticker">Ticker</Label>
            <Input
              id="investment-ticker"
              placeholder="AAPL"
              value={form.ticker}
              onChange={(event) => setField('ticker', event.target.value.toUpperCase())}
              disabled={isEditing}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-type">Type</Label>
            <Select value={form.transaction_type} onValueChange={(value) => setField('transaction_type', value as InvestmentTransactionType)}>
              <SelectTrigger id="investment-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
                <SelectItem value="DRIP">DRIP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-date">Trade date</Label>
            <Input
              id="investment-date"
              type="date"
              value={form.trade_date}
              onChange={(event) => setField('trade_date', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-quantity">Quantity</Label>
            <Input
              id="investment-quantity"
              type="number"
              min="0"
              step="0.000001"
              value={form.quantity}
              onChange={(event) => setField('quantity', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-price">Unit price</Label>
            <Input
              id="investment-price"
              type="number"
              min="0"
              step="0.000001"
              value={form.unit_price}
              onChange={(event) => setField('unit_price', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-fees">Fees</Label>
            <Input
              id="investment-fees"
              type="number"
              min="0"
              step="0.000001"
              value={form.fees}
              onChange={(event) => setField('fees', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment-currency">Trade currency</Label>
            <Select value={form.trade_currency} onValueChange={(value) => setField('trade_currency', value)}>
              <SelectTrigger id="investment-currency">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="investment-fx">FX rate override to CAD (optional)</Label>
            <Input
              id="investment-fx"
              type="number"
              min="0"
              step="0.000001"
              value={form.fx_rate_to_cad}
              onChange={(event) => setField('fx_rate_to_cad', event.target.value)}
              placeholder="Leave blank to use cached FX"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="investment-notes">Notes</Label>
            <textarea
              id="investment-notes"
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !canSubmit}>
            {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Add trade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
