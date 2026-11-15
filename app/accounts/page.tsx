"use client"
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/page-layout';
import { AddAccountDialog } from '@/components/add-account-dialog';
import { EditAccountDialog } from '@/components/edit-account-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Archive, ChevronDown, ChevronRight, Pencil, Plus, type LucideIcon } from 'lucide-react';
import { accountIcons, CATEGORY_COLORS } from '@/lib/constants';
import { getAccounts, deleteAccount } from '@/lib/accounts';
import { toast } from 'sonner';
import { getNetWorthHistory } from '@/lib/balances';
import { NetWorthDataPoint } from '@/lib/types';
import { format, subMonths, startOfMonth, startOfYear } from 'date-fns';

const TIMELINE_OPTIONS = [
  { value: "month-to-date", label: "Month to Date" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "all-time", label: "All Time" },
];

interface Account {
  id: string;
  type: string;
  name: string;
  subtype: string;
  balance: number;
  icon: unknown;
  lastUpdated: string;
}

interface GroupedAccounts {
  [key: string]: Account[];
}

interface AccountDisplayGroup {
  key: string
  label: string
  accounts: Account[]
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
    case 'month-to-date':
      return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate, granularity: 'daily' };
    case 'last-6-months':
      return { startDate: format(subMonths(today, 6), 'yyyy-MM-dd'), endDate, granularity: 'monthly' };
    case 'year-to-date':
      return { startDate: format(startOfYear(today), 'yyyy-MM-dd'), endDate, granularity: 'monthly' };
    case 'all-time':
      return { startDate: '2020-01-01', endDate, granularity: 'monthly' };
    default:
      return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate, granularity: 'daily' };
  }
}

const transformAccountsFromApi = (accountsData: Awaited<ReturnType<typeof getAccounts>>): Account[] =>
  (accountsData || []).map((account) => ({
    id: account.id?.toString() || '',
    type: account.account_type,
    name: account.account_name,
    subtype: account.account_subtype || '',
    balance: parseFloat(account.account_balance) || 0,
    icon: accountIcons[account.account_type] || accountIcons['Cash'],
    lastUpdated: 'Just now',
  }));

export default function Accounts() {
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [netWorthTimeline, setNetWorthTimeline] = useState<string>("month-to-date");
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([]);
  const [loadingNetWorth, setLoadingNetWorth] = useState(true);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsRetry, setAccountsRetry] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [loadedTimeline, setLoadedTimeline] = useState(netWorthTimeline);

  // Start accounts and chart reads independently; do not display an initial $0.
  useEffect(() => {
    let active = true;
    setAccountsError(null);
    void getAccounts().then((rows) => {
      if (!active) return;
      setAccounts(transformAccountsFromApi(rows));
      setAccountsLoaded(true);
    }).catch(() => {
      if (active) setAccountsError('Unable to load accounts. Please try again.');
    });
    return () => { active = false; };
  }, [accountsRetry]);

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    try {
      await deleteAccount(accountToDelete.id);
      const accountsData = await getAccounts();
      setAccounts(transformAccountsFromApi(accountsData));
      setAccountToDelete(null);
      toast.success('Account archived');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to archive account');
    }
  };

  // Fetch net worth history when timeline changes
  useEffect(() => {
    let active = true;
    const fetchNetWorthHistory = async () => {
      setLoadingNetWorth(true);
      setHistoryError(null);
      try {
        const { startDate, endDate, granularity } = getDateRange(netWorthTimeline);
        const data = await getNetWorthHistory(startDate, endDate, granularity);
        if (!active) return;
        setNetWorthData(data);
        setLoadedTimeline(netWorthTimeline);
        setHistoryLoaded(true);
      } catch (error) {
        console.error('Failed to fetch net worth history:', error);
        if (active) setHistoryError('Unable to load net worth history. Please try again.');
      } finally {
        if (active) setLoadingNetWorth(false);
      }
    };
    void fetchNetWorthHistory();
    return () => { active = false; };
  }, [netWorthTimeline, historyRetry]);

  const isMonthOnlyTimeline = ['last-6-months', 'year-to-date', 'all-time'].includes(loadedTimeline);

  const chartData = useMemo(() => {
    return netWorthData.map(point => {
      const dateStr = point.date.length === 7 ? point.date + '-01' : point.date;
      const name = isMonthOnlyTimeline
        ? format(new Date(dateStr), 'MMM yyyy')
        : format(new Date(dateStr), 'MMM dd');
      return { name, 'Net Worth': point.net_worth };
    });
  }, [netWorthData, isMonthOnlyTimeline]);

  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 0];

    const values = chartData.map((point) => point['Net Worth']);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.05, 100) : Math.max(span * 0.12, 100);

    return [min - padding, max + padding];
  }, [chartData]);

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

  const displayGroups = useMemo<AccountDisplayGroup[]>(() => {
    const byBalanceDesc = (a: Account, b: Account) => b.balance - a.balance

    const cashAccounts = accounts
      .filter((account) => account.type === 'Cash')
      .sort(byBalanceDesc)

    const investmentAccounts = accounts
      .filter((account) => account.type === 'Investments')
      .sort(byBalanceDesc)

    const liabilityAccounts = accounts
      .filter((account) => LIABILITY_TYPES.includes(account.type))
      .sort(byBalanceDesc)

    const groups: AccountDisplayGroup[] = [
      { key: 'cash', label: 'Cash', accounts: cashAccounts },
      { key: 'investments', label: 'Investments', accounts: investmentAccounts },
      { key: 'liabilities', label: 'Liabilities', accounts: liabilityAccounts },
    ]

    return groups.filter((group) => group.accounts.length > 0)
  }, [accounts])

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

  const netWorthChartColor = currentNetWorth < 0 ? 'var(--destructive)' : 'var(--chart-1)';

  if (!accountsLoaded) {
    return (
      <PageLayout title="Accounts" description="Your assets, liabilities, and the balance between them">
        {accountsError ? <p role="alert">{accountsError}{' '}
          <Button variant="outline" onClick={() => setAccountsRetry((value) => value + 1)}>Retry</Button>
        </p> : <p role="status" aria-busy="true" className="text-muted-foreground">Loading accounts…</p>}
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Accounts"
      description="Your assets, liabilities, and the balance between them"
      action={
        <Button onClick={() => setIsAddAccountOpen(true)}>
          <Plus className="w-4 h-4" />
          Add account
        </Button>
      }
    >
    {/* Net Worth Chart */}
    <Card className="w-full">
        <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <CardTitle className="text-base font-medium">Net worth over time</CardTitle>
                    <CardDescription className="mt-3 text-3xl font-medium tracking-tight text-foreground">
                      {formatCurrency(currentNetWorth)}
                    </CardDescription>
                </div>
                <Select value={netWorthTimeline} onValueChange={setNetWorthTimeline}>
                  <SelectTrigger className="w-full sm:w-[180px]" aria-label="Select timeline range">
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
            </div>
        </CardHeader>
        <CardContent aria-busy={loadingNetWorth}>
            {loadingNetWorth && historyLoaded && <p role="status" className="text-sm text-muted-foreground">Updating history… Showing the previous timeline.</p>}
            {historyError && <p role="alert" className="text-sm text-destructive">{historyError}{' '}
              {historyLoaded && 'Showing the previous timeline. '}
              <button className="underline" disabled={loadingNetWorth} onClick={() => setHistoryRetry((value) => value + 1)}>Retry</button>
            </p>}
            <div className="w-full h-[300px]">
            {loadingNetWorth && !historyLoaded ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading net worth history…</p>
              </div>
            ) : historyError && !historyLoaded ? null : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No historical data available. Add transactions to see your net worth history.</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                data={chartData}
                margin={{
                    top: 16,
                    right: 8,
                    left: 0,
                    bottom: 8,
                }}
                >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={32} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(value) => {
                    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
                  }}
                  width={64}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--foreground)' }}
                />
                <Area
                  type="monotone"
                  dataKey="Net Worth"
                  stroke={netWorthChartColor}
                  fill={netWorthChartColor}
                  fillOpacity={0.08}
                  strokeWidth={2}
                  dot={chartData.length === 1 ? { r: 3, fill: netWorthChartColor } : false}
                  isAnimationActive={false}
                  activeDot={{
                    r: 5,
                    stroke: netWorthChartColor,
                    strokeWidth: 2,
                    fill: 'var(--background)',
                  }}
                />
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

        {/* Edit Account Dialog */}
        <EditAccountDialog
          open={!!editingAccount}
          onOpenChange={(open) => !open && setEditingAccount(null)}
          account={editingAccount}
          setAccounts={setAccounts}
        />

        {/* Archive Account Confirmation Modal */}
        <Dialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
          <DialogContent showCloseButton={true}>
            <DialogHeader>
              <DialogTitle>Archive account</DialogTitle>
              <DialogDescription>
                {accountToDelete ? (
                  <>
                    Archive <strong>{accountToDelete.name}</strong>? It will be hidden from active account lists, but historical transactions and reports will keep their account links.
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccountToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAccount}>
                Archive
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Accounts Grouped List - Takes 2 columns */}
            <div className="lg:col-span-2 space-y-4">
                {displayGroups.length > 0 ? (
                    displayGroups.map((group) => {
                        const isCollapsed = collapsedGroups.has(group.key);
                        const total = group.accounts.reduce((sum, acc) => sum + acc.balance, 0);
                        
                        return (
                            <Card key={group.key} className="w-full gap-0 overflow-hidden py-0">
                                <button
                                    type="button"
                                    aria-expanded={!isCollapsed}
                                    aria-label={`${group.label}, ${formatCurrency(total)}`}
                                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-offset-[-3px]"
                                    onClick={() => toggleGroup(group.key)}
                                >
                                    <div className="flex items-center gap-3">
                                        {isCollapsed ? (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="font-semibold">{group.label}</span>
                                    </div>
                                    <span className="font-semibold">{formatCurrency(total)}</span>
                                </button>

                                {!isCollapsed && (
                                    <div className="border-t">
                                        {group.accounts.map((account) => {
                                            const IconComponent = account.icon as LucideIcon;
                                            return (
                                            <div
                                                key={account.id}
                                                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                                            >
                                                <Link href={`/accounts/${account.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 transition-colors hover:text-primary">
                                                    <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex">
                                                        <IconComponent aria-hidden="true" className="size-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="truncate text-sm font-medium">{account.name}</div>
                                                        <div className="truncate text-xs text-muted-foreground">{account.subtype}</div>
                                                    </div>
                                                    <span className="shrink-0 text-right text-sm font-medium tabular-nums">{formatCurrency(account.balance)}</span>
                                                </Link>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingAccount(account)} aria-label={`Edit ${account.name}`}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setAccountToDelete(account)} aria-label={`Archive ${account.name}`}>
                                                        <Archive className="h-4 w-4" />
                                                    </Button>
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
                        <CardContent className="py-8 text-center">
                            <h2 className="text-base font-medium">Start with an account</h2>
                            <p className="mx-auto mt-2 max-w-72 text-sm leading-6 text-muted-foreground">Add your cash, investments, or credit card to see where you stand</p>
                            <Button className="mt-4" variant="outline" onClick={() => setIsAddAccountOpen(true)}><Plus className="size-4" />Add account</Button>
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
