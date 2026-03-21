'use server'

import {
  getInvestmentAllocationData,
  getInvestmentDashboardData,
  getInvestmentRealizedData,
} from '@/lib/investments/portfolio'
import { runInvestmentMarketSync } from '@/lib/investments/sync'
import {
  createInvestmentTransaction,
  deleteInvestmentTransaction,
  getInvestmentTransactions,
  updateInvestmentTransaction,
} from '@/lib/investments/transactions'
import type {
  CreateInvestmentTransactionInput,
  InvestmentSyncSlot,
  InvestmentTimeRange,
  UpdateInvestmentTransactionInput,
} from '@/lib/investments/types'

export async function getInvestmentsDashboardAction(range: InvestmentTimeRange = '1Y') {
  return getInvestmentDashboardData({ range })
}

export async function getInvestmentsRealizedAction(input?: {
  accountTypeId?: string
  ticker?: string
  startDate?: string
  endDate?: string
}) {
  return getInvestmentRealizedData(input)
}

export async function getInvestmentsAllocationAction(range: InvestmentTimeRange = '1Y') {
  return getInvestmentAllocationData({ range })
}

export async function listInvestmentTransactionsAction(input?: {
  accountTypeId?: string
  securityId?: string
  startDate?: string
  endDate?: string
  limit?: number
}) {
  return getInvestmentTransactions(input)
}

export async function createInvestmentTransactionAction(input: CreateInvestmentTransactionInput) {
  return createInvestmentTransaction(input)
}

export async function updateInvestmentTransactionAction(
  transactionId: string,
  input: UpdateInvestmentTransactionInput,
) {
  return updateInvestmentTransaction(transactionId, input)
}

export async function deleteInvestmentTransactionAction(transactionId: string) {
  return deleteInvestmentTransaction(transactionId)
}

export async function triggerInvestmentMarketSyncAction(input?: {
  slot?: InvestmentSyncSlot
  force?: boolean
}) {
  return runInvestmentMarketSync({
    slot: input?.slot ?? 'manual',
    force: input?.force ?? true,
  })
}
