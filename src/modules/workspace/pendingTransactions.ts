import { Models } from '@dbModels'
import type SafeTransaction from '@models/schema/safeTransaction'
import ModelUtils from '@models/utils/models'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import type { IWorkspaceAccountRef } from '@src/types/workspace'
import { ISafeTransactionState, type ITransactionExtraParams, ITransactionSide, ITransactionType } from '@types'
import type { PipelineStage, QueryFilter } from 'mongoose'

const WorkspacePendingTransactions = {
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
          nonceNumber: { $toLong: '$nonce' },
        },
      },
    ]
  },

  async total(match: QueryFilter<SafeTransaction>): Promise<number> {
    return Models.SafeTransaction.countDocuments(match)
  },
}

export default WorkspacePendingTransactions
