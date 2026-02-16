"use client"

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, Home, Car, Award, ArrowUp, CreditCard, Building2, FileText, ArrowDown, ArrowLeft } from 'lucide-react';
import { createAccount, getAccounts } from '@/lib/accounts';
import { accountIcons } from '@/lib/constants';

interface Account {
  id: string;
  type: string;
  name: string;
  subtype: string;
  balance: number;
  icon: any;
  lastUpdated: string;
}

interface AccountFormData {
  name: string;
  subtype: string;
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: { type: string; formData: AccountFormData }) => void;
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
}

const accountTypes = {
  asset: [
    { name: 'Cash', icon: DollarSign },
    { name: 'Investments', icon: TrendingUp },
    { name: 'Real Estate', icon: Home },
    { name: 'Valuables', icon: Award },
    { name: 'Other Assets', icon: ArrowUp },
  ],
  liability: [
    { name: 'Credit Card', icon: CreditCard },
    { name: 'Mortgage', icon: Building2 },
    { name: 'Loans', icon: FileText },
    { name: 'Vehicles', icon: Car },
    { name: 'Other Liabilities', icon: ArrowDown },
  ],
};

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
};

export function AddAccountDialog({ open, onOpenChange, setAccounts }: AddAccountDialogProps) {
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);
  const [formData, setFormData] = useState<AccountFormData>({
    name: '',
    subtype: '',
  });
  const [balance, setBalance] = useState('');
  const [displayBalance, setDisplayBalance] = useState('$');
  const [errors, setErrors] = useState<{ name?: string; subtype?: string; balance?: string }>({});

  const handleAccountTypeSelect = (typeName: string) => {
    setSelectedAccountType(typeName);
    const subtypes = accountSubtypes[typeName] || [];
    setFormData({
      name: '',
      subtype: subtypes[0] || '',
    });
    setBalance('');
    setDisplayBalance('$');
    setErrors({});
  };

  const handleBack = () => {
    setSelectedAccountType(null);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedAccountType(null);
    setFormData({
      name: '',
      subtype: '',
    });
    setBalance('');
    setDisplayBalance('$');
    setErrors({});
  };

  const handleSave = async () => {
    if (!selectedAccountType) return;

    const balanceValue = parseFloat(balance);
    const newErrors: { name?: string; subtype?: string; balance?: string } = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.subtype) newErrors.subtype = 'Type is required';
    if (balance === '' || isNaN(balanceValue)) newErrors.balance = 'Balance is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    await createAccount({
      type: selectedAccountType,
      name: formData.name.trim(),
      subtype: formData.subtype,
      balance: balanceValue,
    });

    const accountsData = await getAccounts();

    const transformedAccounts: Account[] = (accountsData || []).map((account) => ({
      id: account.id?.toString() || '',
      type: account.account_type,
      name: account.account_name,
      subtype: account.account_subtype || '',
      balance: parseFloat(account.account_balance) || 0,
      icon: accountIcons[account.account_type] || DollarSign,
      lastUpdated: 'Just now',
    }));

    setAccounts(transformedAccounts);
    handleCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {!selectedAccountType ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Add Account</DialogTitle>
            </DialogHeader>

            <div className="-mx-6 px-6">
              {/* Asset Section */}
              <div className="mb-6">
                <h3 className="text-muted-foreground text-sm font-medium mb-3">Asset</h3>
                <div className="space-y-1">
                  {accountTypes.asset.map((type) => (
                    <button
                      key={type.name}
                      className="group w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent hover:text-white transition-colors text-left"
                      onClick={() => handleAccountTypeSelect(type.name)}
                    >
                      <type.icon className="h-5 w-5 text-foreground group-hover:text-white" />
                      <span className="text-base">{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Liability Section */}
              <div className="mb-4">
                <h3 className="text-muted-foreground text-sm font-medium mb-3">Liability</h3>
                <div className="space-y-1">
                  {accountTypes.liability.map((type) => (
                    <button
                      key={type.name}
                      className="group w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent hover:text-white transition-colors text-left"
                      onClick={() => handleAccountTypeSelect(type.name)}
                    >
                      <type.icon className="h-5 w-5 text-foreground group-hover:text-white" />
                      <span className="text-base">{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-0 top-0 h-8 w-8"
                onClick={handleBack}
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <DialogTitle className="text-xl pl-10">Add {selectedAccountType} Account</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Name Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className="w-full"
                  placeholder={`My ${selectedAccountType} Account`}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name}</p>
                )}
              </div>

              {/* Type/Subtype Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Type</label>
                <Select
                  value={formData.subtype}
                  onValueChange={(value) => {
                    setFormData({ ...formData, subtype: value });
                    if (errors.subtype) setErrors((prev) => ({ ...prev, subtype: undefined }));
                  }}
                >
                  <SelectTrigger className="w-full" aria-invalid={!!errors.subtype}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountSubtypes[selectedAccountType]?.map((subtype) => (
                      <SelectItem key={subtype} value={subtype}>
                        {subtype}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.subtype && (
                  <p className="text-sm text-destructive mt-1">{errors.subtype}</p>
                )}
              </div>

              {/* Balance Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Balance</label>
                <Input
                  type="text"
                  value={displayBalance}
                  className="w-full text-lg"
                  placeholder="$0.00"
                  aria-invalid={!!errors.balance}
                  onChange={(e) => {
                    if (errors.balance) setErrors((prev) => ({ ...prev, balance: undefined }));
                    let value = e.target.value.replace(/[^0-9.]/g, '');

                    if (value === '') {
                      setBalance('');
                      setDisplayBalance('$');
                      return;
                    }

                    const parts = value.split('.');
                    if (parts.length > 2) {
                      value = parts[0] + '.' + parts.slice(1).join('');
                    }
                    if (parts.length === 2 && parts[1].length > 2) {
                      value = parts[0] + '.' + parts[1].slice(0, 2);
                    }

                    setBalance(value);

                    const [integerPart, decimalPart] = value.split('.');
                    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    const formatted =
                      decimalPart !== undefined
                        ? `$${formattedInteger}.${decimalPart}`
                        : `$${formattedInteger}`;
                    setDisplayBalance(formatted);
                  }}
                />
                {errors.balance && (
                  <p className="text-sm text-destructive mt-1">{errors.balance}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="px-6 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

