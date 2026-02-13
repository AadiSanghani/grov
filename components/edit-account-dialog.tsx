"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DollarSign, TrendingUp, Home, Car, Award, ArrowUp, CreditCard, Building2, FileText, ArrowDown } from 'lucide-react'
import { updateAccount, getAccounts } from '@/lib/accounts'
import { accountIcons } from '@/lib/constants'
import { toast } from 'sonner'

interface Account {
  id: string
  type: string
  name: string
  subtype: string
  balance: number
  icon: unknown
  lastUpdated: string
}

interface EditAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
}

const accountTypesList = [
  { name: 'Cash', icon: DollarSign },
  { name: 'Investments', icon: TrendingUp },
  { name: 'Real Estate', icon: Home },
  { name: 'Valuables', icon: Award },
  { name: 'Other Assets', icon: ArrowUp },
  { name: 'Credit Card', icon: CreditCard },
  { name: 'Mortgage', icon: Building2 },
  { name: 'Loans', icon: FileText },
  { name: 'Vehicles', icon: Car },
  { name: 'Other Liabilities', icon: ArrowDown },
]

const accountSubtypes: { [key: string]: string[] } = {
  'Cash': ['Checking', 'Savings', 'CD', 'Money Market', 'Cash'],
  'Investments': ['Brokerage (Taxable)', 'First Home Savings Account (FHSA)', 'Tax-Free Savings Account (TFSA)', 'Registered Retirement Savings Plan (RRSP)'],
  'Real Estate': ['Primary Home', 'Secondary Home', 'Investment Property', 'Commercial Property'],
  'Vehicles': ['Car', 'Motorcycle', 'Boat', 'RV', 'Other'],
  'Valuables': ['Jewelry', 'Art', 'Collectibles', 'Other'],
  'Other Assets': ['Other'],
  'Credit Card': ['Credit Card'],
  'Mortgage': ['Primary Home', 'Secondary Home', 'Investment Property'],
  'Loans': ['Student', 'Personal', 'Auto', 'Other'],
  'Other Liabilities': ['Other'],
}

function formatBalanceForDisplay(value: number): string {
  if (value === 0) return '$0'
  const [integerPart, decimalPart] = value.toFixed(2).split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${formattedInteger}.${decimalPart}`
}

export function EditAccountDialog({ open, onOpenChange, account, setAccounts }: EditAccountDialogProps) {
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('')
  const [subtype, setSubtype] = useState('')
  const [balance, setBalance] = useState('')
  const [displayBalance, setDisplayBalance] = useState('$')
  const [errors, setErrors] = useState<{ name?: string; subtype?: string; balance?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && account) {
      setName(account.name)
      setAccountType(account.type)
      const subtypes = accountSubtypes[account.type] || []
      setSubtype(account.subtype && subtypes.includes(account.subtype) ? account.subtype : subtypes[0] || '')
      const bal = account.balance.toString()
      setBalance(bal)
      setDisplayBalance(formatBalanceForDisplay(account.balance))
      setErrors({})
    }
  }, [open, account])

  const handleTypeChange = (typeName: string) => {
    setAccountType(typeName)
    const subtypes = accountSubtypes[typeName] || []
    setSubtype(subtypes[0] || '')
  }

  const handleCancel = () => {
    onOpenChange(false)
    setErrors({})
  }

  const handleSave = async () => {
    if (!account) return

    const balanceValue = parseFloat(balance)
    const newErrors: { name?: string; subtype?: string; balance?: string } = {}
    if (!name.trim()) newErrors.name = 'Name is required'
    if (!subtype) newErrors.subtype = 'Type is required'
    if (balance === '' || isNaN(balanceValue)) newErrors.balance = 'Balance is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setSaving(true)
    try {
      await updateAccount(account.id, {
        name: name.trim(),
        type: accountType,
        subtype,
        balance: balanceValue,
      })

      const accountsData = await getAccounts()
      const transformedAccounts: Account[] = (accountsData || []).map((acc) => ({
        id: acc.id?.toString() || '',
        type: acc.account_type,
        name: acc.account_name,
        subtype: acc.account_subtype || '',
        balance: parseFloat(acc.account_balance) || 0,
        icon: accountIcons[acc.account_type] || DollarSign,
        lastUpdated: 'Just now',
      }))

      setAccounts(transformedAccounts)
      toast.success('Account updated')
      handleCancel()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  if (!account) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Edit Account</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <label className="text-base font-medium mb-2 block">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
              }}
              className="w-full"
              placeholder="Account name"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="text-base font-medium mb-2 block">Account type</label>
            <Select value={accountType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-full" aria-invalid={!!errors.subtype}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {accountTypesList.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-base font-medium mb-2 block">Type</label>
            <Select
              value={subtype}
              onValueChange={(value) => {
                setSubtype(value)
                if (errors.subtype) setErrors((prev) => ({ ...prev, subtype: undefined }))
              }}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.subtype}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {accountSubtypes[accountType]?.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.subtype && <p className="text-sm text-destructive mt-1">{errors.subtype}</p>}
          </div>

          <div>
            <label className="text-base font-medium mb-2 block">Balance</label>
            <Input
              type="text"
              value={displayBalance}
              className="w-full text-lg"
              placeholder="$0.00"
              aria-invalid={!!errors.balance}
              onChange={(e) => {
                if (errors.balance) setErrors((prev) => ({ ...prev, balance: undefined }))
                let value = e.target.value.replace(/[^0-9.]/g, '')

                if (value === '') {
                  setBalance('')
                  setDisplayBalance('$')
                  return
                }

                const parts = value.split('.')
                if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('')
                if (parts.length === 2 && parts[1].length > 2) value = parts[0] + '.' + parts[1].slice(0, 2)

                setBalance(value)
                const [integerPart, decimalPart] = value.split('.')
                const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                setDisplayBalance(
                  decimalPart !== undefined ? `$${formattedInteger}.${decimalPart}` : `$${formattedInteger}`
                )
              }}
            />
            {errors.balance && <p className="text-sm text-destructive mt-1">{errors.balance}</p>}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} className="px-6" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="px-6 bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
