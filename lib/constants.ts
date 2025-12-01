import { DollarSign, TrendingUp, Home, Car, Award, ArrowUp, CreditCard, Building2, FileText, ArrowDown } from 'lucide-react';

export const accountIcons: { [key: string]: any } = {
  'Cash': DollarSign,
  'Investments': TrendingUp,
  'Real Estate': Home,
  'Vehicles': Car,
  'Valuables': Award,
  'Other Assets': ArrowUp,
  'Credit Card': CreditCard,
  'Mortgage': Building2,
  'Loans': FileText,
  'Other Liabilities': ArrowDown,
};

export const CATEGORY_COLORS: { [key: string]: string } = {
  'Cash': '#10b981',
  'Investments': '#3b82f6',
  'Real Estate': '#6366f1',
  'Vehicles': '#8b5cf6',
  'Valuables': '#d946ef',
  'Other Assets': '#ec4899',
  'Credit Card': '#ef4444',
  'Mortgage': '#f97316',
  'Loans': '#f59e0b',
  'Other Liabilities': '#eab308',
};

