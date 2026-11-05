import { Models } from '@dbModels'
import type SafeTransaction from '@models/schema/safeTransaction'
import ModelUtils from '@models/utils/models'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import WorkspaceAccounts from '@modules/workspace/accounts'
import type { IWorkspaceAccountRef, IWorkspaceCoverage } from '@src/types/workspace'
import { ISafeTransactionState, type ITransactionExtraParams, ITransactionSide, ITransactionType } from '@types'
import type { PipelineStage, QueryFilter } from 'mongoose'

const WorkspacePendingTransactions = {
  async coverage(
    accounts: IWorkspaceAccountRef[],
  ): Promise<{ coverage: IWorkspaceCoverage[]; stale: IWorkspaceAccountRef[] }> {
    const [rows, daos] = await Promise.all([
      Models.SafeAccount.find(WorkspaceAccountScope.filter(accounts, 'safeAddress'))
        .select('network safeAddress queueFetchedAt queueComplete')
        .lean(),
      WorkspaceAccounts.findDaos(accounts),
    ])
    const safes = new Map(
      rows.map(row => [WorkspaceAccountScope.key({ network: row.network, address: row.safeAddress }), row]),
    )
    const stale: IWorkspaceAccountRef[] = []
    const coverage: IWorkspaceCoverage[] = accounts.map(account => {
      const key = WorkspaceAccountScope.key(account)
      const safe = safes.get(key)
      if (!safe) {
        return {
          account,
          resource: 'transactions',
          source: 'index',
          status: daos.has(key) ? 'available' : 'unverified',
        }
      }

      const freshness = SafeTransactionsModule.freshnessOf(safe)
      if (freshness.stale) stale.push(account)
      return {
        account,
        resource: 'transactions',
        source: 'safe',
        status: freshness.partial ? 'partial' : 'available',
        ...(freshness.stale && { stale: true }),
      }
    })
    return { coverage, stale }
  },

  match(
    accounts: IWorkspaceAccountRef[],
    filters: ITransactionExtraParams,
    search?: string,
  ): QueryFilter<SafeTransaction> | null {
    if (
      (filters.type && filters.type !== ITransactionType.execution) ||
      (filters.side && filters.side !== ITransactionSide.execution) ||
      filters.tokenAddress
    ) {
      return null
    }

    return {
      ...WorkspaceAccountScope.filter(accounts, 'safeAddress'),
      ...ModelUtils.createFilter({ search }, ['safeTxHash', 'from', 'safeAddress']),
      state: ISafeTransactionState.live,
      ...(filters.network && { network: filters.network }),
      ...(filters.fromAddress && { from: filters.fromAddress }),
      ...(filters.toAddress && { safeAddress: filters.toAddress }),
    }
  },

  pipeline(match: QueryFilter<SafeTransaction>): PipelineStage[] {
    return [
      { $match: match },
      {
        $project: {
          _id: 0,
          id: 1,
          status: { $literal: 'pending' },
          network: 1,
          daoAddress: '$safeAddress',
          type: { $literal: ITransactionType.execution },
          side: { $literal: ITransactionSide.execution },
          source: { $literal: 'safe' },
          fromAddress: '$from',
          toAddress: '$safeAddress',
          value: { $literal: '0' },
          amountUsd: { $literal: '0' },
          transactionHash: { $literal: null },
          blockNumber: { $literal: null },
          blockTimestamp: { $literal: null },
          transactionIndex: { $literal: null },
          logIndex: { $literal: null },
          isSuccessful: { $literal: null },
          safeTxHash: 1,
          nonce: 1,
          submittedAt: { $floor: { $divide: [{ $toLong: { $toDate: '$submissionDate' } }, 1000] } },
          confirmations: { $size: '$confirmations' },
          confirmationsRequired: 1,
          actionCount: { $size: '$rawActions' },
          rank: { $literal: 0 },
          nonceNumber: { $convert: { input: '$nonce', to: 'long', onError: { $toLong: '9223372036854775807' } } },
        },
      },
    ]
  },

  async total(match: QueryFilter<SafeTransaction>): Promise<number> {
    return Models.SafeTransaction.countDocuments(match)
  },
}

export default WorkspacePendingTransactions
