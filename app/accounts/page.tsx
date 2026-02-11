"use client"
import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/page-layout';
import { AddAccountDialog } from '@/components/add-account-dialog';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { accountIcons, CATEGORY_COLORS } from '@/lib/constants';
import { getAccounts } from '@/lib/accounts';
import { getNetWorthHistory } from '@/lib/balances';
import { NetWorthDataPoint } from '@/lib/types';
import { format, subDays, subMonths, startOfMonth, startOfYear } from 'date-fns';

const TIMELINE_OPTIONS = [
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "month-to-date", label: "Month to Date" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "all-time", label: "All Time" },
];

function TimelineSelectInner({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = require("@/components/ui/select");
  
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select timeline" />
      </SelectTrigger>
      <SelectContent>
        {TIMELINE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const TimelineSelect = dynamic(() => Promise.resolve(TimelineSelectInner), {
  ssr: false,
  loading: () => (
    <div className="w-[180px] h-12 rounded-lg border border-input bg-background animate-pulse" />
  ),
});


interface Account {
  id: string;
  type: string;
  name: string;
  subtype: string;
  balance: number;
  icon: any;
  lastUpdated: string;
}

interface GroupedAccounts {
  [key: string]: Account[];
}

const ASSET_TYPES = ['Cash', 'Investments', 'Real Estate', 'Valuables', 'Other Assets'];
const LIABILITY_TYPES = ['Credit Card', 'Mortgage', 'Loans', 'Vehicles','Other Liabilities' ];

// Helper to get date range based on timeline selection
function getDateRange(timeline: string): { startDate: string; endDate: string; granularity: 'daily' | 'monthly' } {
  const today = new Date();
  // Add 1 day to end date to account for UTC vs local timezone differences
  // This ensures we capture records created in UTC that might appear as "tomorrow" locally
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endDate = format(tomorrow, 'yyyy-MM-dd');
  
  switch (timeline) {
    case 'last-30-days':
      return { startDate: format(subDays(today, 30), 'yyyy-MM-dd'), endDate, granularity: 'daily' };
    case 'month-to-date':
      return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate, granularity: 'daily' };
    case 'last-6-months':
      return { startDate: format(subMonths(today, 6), 'yyyy-MM-dd'), endDate, granularity: 'monthly' };
    case 'year-to-date':
      return { startDate: format(startOfYear(today), 'yyyy-MM-dd'), endDate, granularity: 'monthly' };
    case 'all-time':
      return { startDate: '2020-01-01', endDate, granularity: 'monthly' };
    default:
      return { startDate: format(subDays(today, 30), 'yyyy-MM-dd'), endDate, granularity: 'daily' };
  }
}

export default function Accounts() {
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [netWorthTimeline, setNetWorthTimeline] = useState<string>("last-30-days");
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([]);
  const [loadingNetWorth, setLoadingNetWorth] = useState(true);

  // Fetch accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      const accountsData = await getAccounts();
      
      const transformedAccounts: Account[] = (accountsData || []).map((account) => ({
        id: account.id?.toString() || '',
        type: account.account_type,
        name: account.account_name,
        subtype: account.account_subtype || '',
        balance: parseFloat(account.account_balance) || 0,
        icon: accountIcons[account.account_type] || accountIcons['Cash'],
        lastUpdated: 'Just now',
      }));
      
      setAccounts(transformedAccounts);
    };
    fetchAccounts();
  }, []);

  // Fetch net worth history when timeline changes
  useEffect(() => {
    const fetchNetWorthHistory = async () => {
      setLoadingNetWorth(true);
      try {
        const { startDate, endDate, granularity } = getDateRange(netWorthTimeline);
        const data = await getNetWorthHistory(startDate, endDate, granularity);
        setNetWorthData(data);
      } catch (error) {
        console.error('Failed to fetch net worth history:', error);
        setNetWorthData([]);
      } finally {
        setLoadingNetWorth(false);
      }
    };
    fetchNetWorthHistory();
  }, [netWorthTimeline]);

  const isMonthOnlyTimeline = ['last-6-months', 'year-to-date', 'all-time'].includes(netWorthTimeline);

  const chartData = useMemo(() => {
    return netWorthData.map(point => {
      const dateStr = point.date.length === 7 ? point.date + '-01' : point.date;
      const name = isMonthOnlyTimeline
        ? format(new Date(dateStr), 'MMM yyyy')
        : format(new Date(dateStr), 'MMM dd');
      return { name, 'Net Worth': point.net_worth };
    });
  }, [netWorthData, isMonthOnlyTimeline]);

  // Calculate current net worth from accounts
  const currentNetWorth = useMemo(() => {
    const totalAssets = accounts
      .filter(a => ASSET_TYPES.includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = accounts
      .filter(a => LIABILITY_TYPES.includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);
    return totalAssets - totalLiabilities;
  }, [accounts]);

  const toggleGroup = (groupName: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupName)) {
      newCollapsed.delete(groupName);
    } else {
      newCollapsed.add(groupName);
    }
    setCollapsedGroups(newCollapsed);
  };

  const groupedAccounts: GroupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = [];
    }
    acc[account.type].push(account);
    return acc;
  }, {} as GroupedAccounts);

  const getGroupTotal = (groupName: string) => {
    return groupedAccounts[groupName]?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
  };

  const totalLiabilities = accounts
    .filter(a => LIABILITY_TYPES.includes(a.type))
    .reduce((sum, a) => sum + a.balance, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const netWorthChartColor = currentNetWorth < 0 ? 'var(--destructive)' : 'var(--primary)';

  return (
    <PageLayout
      title="Accounts"
      description="Manage accounts and track net worth over time."
      action={
        <Button onClick={() => setIsAddAccountOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      }
    >
    {/* Net Worth Chart */}
    <Card className="w-full mb-6">
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Net Worth Over Time</CardTitle>
                    <CardDescription>
                      Current: {formatCurrency(currentNetWorth)}
                    </CardDescription>
                </div>
                <TimelineSelect value={netWorthTimeline} onValueChange={setNetWorthTimeline} />
            </div>
        </CardHeader>
        <CardContent className="pt-6">
            <div className="w-full h-[300px]">
            {loadingNetWorth ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading net worth history...</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No historical data available. Add transactions to see your net worth history.</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                data={chartData}
                margin={{
                    top: 24,
                    right: 24,
                    left: 24,
                    bottom: 8,
                }}
                >
                <CartesianGrid strokeDasharray="2 2" horizontal={true} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => {
                    if (value < 0) return `($${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 })})`;
                    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                  }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: 'var(--foreground)' }}
                />
                <Area type="monotone" dataKey="Net Worth" stroke={netWorthChartColor} fill={netWorthChartColor} fillOpacity={0.3} strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
            )}
            </div>
        </CardContent>
    </Card>

        {/* Add Account Dialog */}
        <AddAccountDialog 
          open={isAddAccountOpen} 
          onOpenChange={setIsAddAccountOpen}
          setAccounts={setAccounts}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Accounts Grouped List - Takes 2 columns */}
            <div className="lg:col-span-2 space-y-4">
                {Object.keys(groupedAccounts).length > 0 ? (
                    Object.entries(groupedAccounts).map(([groupName, groupAccounts]) => {
                        const isCollapsed = collapsedGroups.has(groupName);
                        const total = getGroupTotal(groupName);
                        
                        return (
                            <Card key={groupName} className="w-full">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                                    onClick={() => toggleGroup(groupName)}
                                >
                                    <div className="flex items-center gap-3">
                                        {isCollapsed ? (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="font-semibold">{groupName}</span>
                                    </div>
                                    <span className="font-semibold">{formatCurrency(total)}</span>
                                </div>

                                {!isCollapsed && (
                                    <div className="border-t">
                                        {groupAccounts.map((account) => {
                                            const IconComponent = account.icon;
                                            return (
                                            <div
                                                key={account.id}
                                                className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors border-b last:border-b-0"
                                            >
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                        <IconComponent className="h-5 w-5" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="font-medium">{account.name}</div>
                                                        <div className="text-sm text-muted-foreground">{account.subtype}</div>
                                                    </div>
                                                </div>
                                                    <div className="text-right">
                                                    <div className="font-semibold">{formatCurrency(account.balance)}</div>
                                                    <div className="text-sm text-muted-foreground">{account.lastUpdated}</div>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        );
                    })
                ) : (
                    <Card className="w-full">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            No accounts yet. Click "Add Account" to get started.
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Summary Card */}
            <div className="lg:col-span-1">
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Assets Section */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold">Assets</span>
                                <span className="font-semibold">{formatCurrency(accounts.filter(a => ASSET_TYPES.includes(a.type)).reduce((sum, a) => sum + a.balance, 0))}</span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex mb-4">
                                {ASSET_TYPES.map((type) => {
                                    const amount = groupedAccounts[type]?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
                                    const total = accounts.filter(a => ASSET_TYPES.includes(a.type)).reduce((sum, a) => sum + a.balance, 0);
                                    const percent = total > 0 ? (amount / total) * 100 : 0;
                                    if (amount === 0) return null;
                                    
                                    return (
                                        <div 
                                            key={type}
                                            style={{ width: `${percent}%`, backgroundColor: CATEGORY_COLORS[type] }}
                                            className="h-full"
                                        />
                                    );
                                })}
                            </div>
                            <div className="space-y-2">
                                {ASSET_TYPES.map((type) => {
                                    const amount = groupedAccounts[type]?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
                                    if (amount === 0) return null;
                                    
                                    return (
                                        <div key={type} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[type] }} />
                                                <span>{type}</span>
                                            </div>
                                            <span>{formatCurrency(amount)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {totalLiabilities > 0 && (
                            <>
                                <div className="h-px bg-border" />

                                {/* Liabilities Section */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold">Liabilities</span>
                                        <span className="font-semibold">{formatCurrency(totalLiabilities)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex mb-4">
                                        {LIABILITY_TYPES.map((type) => {
                                            const amount = groupedAccounts[type]?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
                                            const percent = totalLiabilities > 0 ? (amount / totalLiabilities) * 100 : 0;
                                            if (amount === 0) return null;
                                            
                                            return (
                                                <div 
                                                    key={type}
                                                    style={{ width: `${percent}%`, backgroundColor: CATEGORY_COLORS[type] }}
                                                    className="h-full"
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="space-y-2">
                                        {LIABILITY_TYPES.map((type) => {
                                            const amount = groupedAccounts[type]?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
                                            if (amount === 0) return null;
                                            
                                            return (
                                                <div key={type} className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[type] }} />
                                                        <span>{type}</span>
                                                    </div>
                                                    <span>{formatCurrency(amount)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>

    </PageLayout>
  );
}