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
  type NetworksEnum,
} from '@types'
import type { PipelineStage, QueryFilter } from 'mongoose'

const WorkspacePendingTransactions = {
  async coverage(
    accounts: IWorkspaceAccountRef[],
  ): Promise<{ coverage: IWorkspaceCoverage[]; stale: IWorkspaceAccountRef[]; tracked: IWorkspaceAccountRef[] }> {
    const byNetwork = new Map<NetworksEnum, HexAddress[]>()
    for (const account of accounts) {
      const addresses = byNetwork.get(account.network) ?? []
      addresses.push(account.address as HexAddress)
      byNetwork.set(account.network, addresses)
    }
    const [rows, daos, installed] = await Promise.all([
      Models.SafeAccount.find(WorkspaceAccountScope.filter(accounts, 'safeAddress'))
        .select('network safeAddress tracked queueFetchedAt queueComplete')
        .lean(),
      WorkspaceAccounts.findDaos(accounts),
      Promise.all(
        [...byNetwork].map(async ([network, addresses]) => ({
          network,
          addresses: await SafeBodyMembersModule.trackedSafeAddresses(addresses, network),
        })),
      ),
    ])
    const safes = new Map<string, Partial<Pick<SafeAccount, 'queueFetchedAt' | 'queueComplete'>>>(
      rows.map(row => [WorkspaceAccountScope.key({ network: row.network, address: row.safeAddress }), row]),
    )
    const stale: IWorkspaceAccountRef[] = []
    const trackedKeys = new Set(
      rows
        .filter(row => row.tracked)
        .map(row => WorkspaceAccountScope.key({ network: row.network, address: row.safeAddress })),
    )
    for (const group of installed) {
      for (const address of group.addresses)
        trackedKeys.add(WorkspaceAccountScope.key({ network: group.network, address }))
    }
    const tracked = accounts.filter(account => trackedKeys.has(WorkspaceAccountScope.key(account)))
    const coverage: IWorkspaceCoverage[] = accounts.map(account => {
      const key = WorkspaceAccountScope.key(account)
      const safe = safes.get(key)
      if (!trackedKeys.has(key)) {
        return {
          account,
          resource: 'transactions',
          source: 'index',
          status: daos.has(key) ? 'available' : 'unverified',
        }
      }
      if (!getSafeShortName(account.network)) {
        return { account, resource: 'transactions', source: 'safe', status: 'unsupported' }
      }

      const freshness = SafeTransactionsModule.freshnessOf(safe ?? null)
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
          submittedAt: { $floor: { $divide: [{ $toLong: { $toDate: '$submissionDate' } }, 1000] } },
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
