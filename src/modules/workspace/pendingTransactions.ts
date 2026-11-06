import { Models } from '@dbModels'
import type SafeAccount from '@models/schema/safeAccount'
import type SafeTransaction from '@models/schema/safeTransaction'
import ModelUtils from '@models/utils/models'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import WorkspaceAccounts from '@modules/workspace/accounts'
import { getSafeShortName } from '@src/types/safeNetwork'
import type { IWorkspaceAccountRef, IWorkspaceCoverage } from '@src/types/workspace'
import {
  type HexAddress,
  ISafeTransactionState,
  type ITransactionExtraParams,
  ITransactionSide,
  ITransactionType,
} from '@types'
import type { PipelineStage, QueryFilter } from 'mongoose'

const WorkspacePendingTransactions = {
  async coverage(
    accounts: IWorkspaceAccountRef[],
  ): Promise<{ coverage: IWorkspaceCoverage[]; stale: IWorkspaceAccountRef[]; tracked: IWorkspaceAccountRef[] }> {
    const [rows, indexed, trackedFlags] = await Promise.all([
      Models.SafeAccount.find(WorkspaceAccountScope.filter(accounts, 'safeAddress'))
        .select('network safeAddress queueFetchedAt queueComplete')
        .lean(),
      WorkspaceAccounts.coverage(accounts, 'transactions'),
      Promise.all(
        accounts.map(account =>
          SafeBodyMembersModule.isTrackedOrRegistered(account.address as HexAddress, account.network),
        ),
      ),
    ])
    const safes = new Map<string, Pick<SafeAccount, 'queueFetchedAt' | 'queueComplete'>>(
      rows.map(row => [WorkspaceAccountScope.key({ network: row.network, address: row.safeAddress }), row]),
    )
    const stale: IWorkspaceAccountRef[] = []
    const tracked: IWorkspaceAccountRef[] = []
    const coverage: IWorkspaceCoverage[] = accounts.map((account, index) => {
      if (!trackedFlags[index]) return indexed[index]
      tracked.push(account)
      if (!getSafeShortName(account.network)) {
        return { account, resource: 'transactions', source: 'safe', status: 'unsupported' }
      }

      const freshness = SafeTransactionsModule.freshnessOf(safes.get(WorkspaceAccountScope.key(account)) ?? null)
      if (freshness.stale) stale.push(account)
      return {
        account,
        resource: 'transactions',
        source: 'safe',
        status: freshness.partial ? 'partial' : 'available',
        ...(freshness.stale && { stale: true }),
      }
    })
    return { coverage, stale, tracked }
  },

  match(
    accounts: IWorkspaceAccountRef[],
    filters: ITransactionExtraParams,
    search?: string,
  ): QueryFilter<SafeTransaction> | null {
    if (
      !accounts.length ||
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
          submittedAt: {
            $floor: {
              $divide: [
                { $toLong: { $convert: { input: '$submissionDate', to: 'date', onError: null, onNull: null } } },
                1000,
              ],
            },
          },
          confirmations: { $size: '$confirmations' },
          confirmationsRequired: 1,
          actionCount: { $size: '$rawActions' },
          rank: { $literal: 0 },
          pendingNonceLength: { $strLenCP: '$nonce' },
          pendingNonce: '$nonce',
        },
      },
    ]
  },
}

export default WorkspacePendingTransactions
