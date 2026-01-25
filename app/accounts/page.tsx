"use client"
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { AddAccountDialog } from '@/components/add-account-dialog';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { accountIcons, CATEGORY_COLORS } from '@/lib/constants';
import { getAccounts } from '@/lib/accounts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


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

const data = [
  {
    name: 'Page A',
    uv: 4000,
    pv: 2400,
    amt: 2400,
  },
  {
    name: 'Page B',
    uv: 3000,
    pv: 1398,
    amt: 2210,
  },
  {
    name: 'Page C',
    uv: 2000,
    pv: 9800,
    amt: 2290,
  },
  {
    name: 'Page D',
    uv: 2780,
    pv: 3908,
    amt: 2000,
  },
  {
    name: 'Page E',
    uv: 1890,
    pv: 4800,
    amt: 2181,
  },
  {
    name: 'Page F',
    uv: 2390,
    pv: 3800,
    amt: 2500,
  },
  {
    name: 'Page G',
    uv: 3490,
    pv: 4300,
    amt: 2100,
  },
];

export default function Accounts() {
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [netWorthTimeline, setNetWorthTimeline] = useState<string>("last-30-days");

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

  return (
    <div className="w-full p-6">
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Accounts</h1>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setIsAddAccountOpen(true)}
            >
              Add Account
            </Button>
        </div>

    {/* Net Worth Chart */}
    <Card className="w-full mb-6">
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Net Worth</CardTitle>
                    <CardDescription>Your net worth over time.</CardDescription>
                </div>
                <Select value={netWorthTimeline} onValueChange={setNetWorthTimeline}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select timeline" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="last-30-days">Last 30 Days</SelectItem>
                        <SelectItem value="month-to-date">Month to Date</SelectItem>
                        <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                        <SelectItem value="year-to-date">Year to Date</SelectItem>
                        <SelectItem value="all-time">All Time</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent className="pt-6">
            <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                data={data}
                margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                }}
                >
                <CartesianGrid strokeDasharray="2 2" horizontal={true} vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pv" stroke="#22577A" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="uv" stroke="#38A3A5" strokeWidth={3} />
                </LineChart>
            </ResponsiveContainer>
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

    </div>
  );
}