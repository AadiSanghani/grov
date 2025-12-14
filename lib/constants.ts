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

export const TRANSACTION_CATEGORIES = [
  {
    group: "Income",
    items: [
      { value: "paychecks", label: "Paychecks", emoji: "💵" },
      { value: "interest", label: "Interest", emoji: "🪙" },
      { value: "business-income", label: "Business Income", emoji: "💰" },
      { value: "other-income", label: "Other Income", emoji: "💰" },
    ]
  },
  {
    group: "Gifts & Donations",
    items: [
      { value: "charity", label: "Charity", emoji: "🎗️" },
      { value: "gifts", label: "Gifts", emoji: "🎁" },
    ]
  },
  {
    group: "Auto & Transport",
    items: [
      { value: "auto-payment", label: "Auto Payment", emoji: "🚗" },
      { value: "public-transit", label: "Public Transit", emoji: "🚇" },
      { value: "gas", label: "Gas", emoji: "⛽" },
      { value: "auto-maintenance", label: "Auto Maintenance", emoji: "🔧" },
      { value: "parking-tolls", label: "Parking & Tolls", emoji: "🅿️" },
      { value: "taxi-rideshares", label: "Taxi & Ride Shares", emoji: "🚕" },
    ]
  },
  {
    group: "Housing",
    items: [
      { value: "mortgage", label: "Mortgage", emoji: "🏠" },
      { value: "rent", label: "Rent", emoji: "🏠" },
      { value: "home-improvement", label: "Home Improvement", emoji: "🔨" },
    ]
  },
  {
    group: "Bills & Utilities",
    items: [
      { value: "garbage", label: "Garbage", emoji: "🗑️" },
      { value: "water", label: "Water", emoji: "💧" },
      { value: "gas-electric", label: "Gas & Electric", emoji: "⚡" },
      { value: "internet-cable", label: "Internet & Cable", emoji: "🌐" },
      { value: "phone", label: "Phone", emoji: "📱" },
    ]
  },
  {
    group: "Food & Dining",
    items: [
      { value: "groceries", label: "Groceries", emoji: "🛒" },
      { value: "restaurants", label: "Restaurants", emoji: "🍽️" },
      { value: "coffee-shops", label: "Coffee Shops", emoji: "☕" },
    ]
  },
];

