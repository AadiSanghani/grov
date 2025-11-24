"use client"

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, Home, Car, Award, ArrowUp, CreditCard, Building2, FileText, ArrowDown, ArrowLeft } from 'lucide-react';

interface AccountFormData {
  name: string;
  subtype: string;
  balance: string;
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: { type: string; formData: AccountFormData }) => void;
}

const accountTypes = {
  asset: [
    { name: 'Cash', icon: DollarSign },
    { name: 'Investments', icon: TrendingUp },
    { name: 'Real Estate', icon: Home },
    { name: 'Vehicles', icon: Car },
    { name: 'Valuables', icon: Award },
    { name: 'Other Assets', icon: ArrowUp },
  ],
  liability: [
    { name: 'Credit Card', icon: CreditCard },
    { name: 'Mortgage', icon: Building2 },
    { name: 'Loans', icon: FileText },
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

export function AddAccountDialog({ open, onOpenChange, onSave }: AddAccountDialogProps) {
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);
  const [formData, setFormData] = useState<AccountFormData>({
    name: '',
    subtype: '',
    balance: '$0.00',
  });

  const handleAccountTypeSelect = (typeName: string) => {
    setSelectedAccountType(typeName);
    const subtypes = accountSubtypes[typeName] || [];
    setFormData({
      name: `My ${typeName} Account`,
      subtype: subtypes[0] || '',
      balance: '$0.00',
    });
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
      balance: '$0.00',
    });
  };

  const handleSave = () => {
    if (selectedAccountType) {
      onSave?.({ type: selectedAccountType, formData });
    }
    handleCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {!selectedAccountType ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Add Account</DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              {/* Asset Section */}
              <div className="mb-6">
                <h3 className="text-muted-foreground text-sm font-medium mb-3">Asset</h3>
                <div className="space-y-1">
                  {accountTypes.asset.map((type) => (
                    <button
                      key={type.name}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                      onClick={() => handleAccountTypeSelect(type.name)}
                    >
                      <type.icon className="h-5 w-5 text-foreground" />
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
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                      onClick={() => handleAccountTypeSelect(type.name)}
                    >
                      <type.icon className="h-5 w-5 text-foreground" />
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
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <DialogTitle className="text-xl pl-10">Add {selectedAccountType} Account</DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 space-y-6">
              {/* Name Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                  placeholder={`My ${selectedAccountType} Account`}
                />
              </div>

              {/* Type/Subtype Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Type</label>
                <Select
                  value={formData.subtype}
                  onValueChange={(value) => setFormData({ ...formData, subtype: value })}
                >
                  <SelectTrigger className="w-full">
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
              </div>

              {/* Balance Field */}
              <div>
                <label className="text-base font-medium mb-2 block">Balance</label>
                <Input
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full"
                  placeholder="$0.00"
                />
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

