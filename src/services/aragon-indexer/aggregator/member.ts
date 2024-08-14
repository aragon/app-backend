import logger from '@logger'
import Member from '@models/schema/member'
import LogMember from '@models/schema/logMember'
import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import DbTx from '@modules/dbTx'
import {HexAddress, IHistoryMember, IQueryGetMemberHistory, NetworksEnum} from '@types'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import MemberHistory from '@models/schema/memberHistory'
import Web3Helper from "@helpers/web3";

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMember' })

export const AggregatorMember = {
  async _queryGetMemberTokenVotingHistory({
    memberAddress,
  }: {
    memberAddress: HexAddress
  }): Promise<IQueryGetMemberHistory | undefined> {
    const query = [
      {
        $match: {
          address: memberAddress,
          event: {
            $in: ['DelegateChanged', 'DelegateVotesChanged'],
          },
        },
      },
      { $sort: { blockNumber: 1, transactionHash: 1 } },
      {
        $group: {
          _id: { address: '$address' },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          events: 1,
        },
      },
      {
        $unwind: '$events',
      },
      AggregationQueryHelper.plugin('$events.pluginAddress', '$events.network'),
      {
        $unwind: {
          path: '$plugin',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: '$address',
          events: {
            $push: {
              $mergeObjects: ['$events', { $ifNull: ['$plugin', {}] }],
            },
          },
        },
      },
      {
        $project: {
          address: '$_id',
          history: {
            $map: {
              input: '$events',
              as: 'event',
              in: {
                network: '$$event.network',
                fromBlockNumber: '$$event.blockNumber',
                fromTxHash: '$$event.transactionHash',
                toBlockNumber: {
                  $cond: {
                    if: { $lt: [{ $indexOfArray: ['$events', '$$event'] }, { $subtract: [{ $size: '$events' }, 1] }] },
                    then: {
                      $arrayElemAt: ['$events.blockNumber', { $add: [{ $indexOfArray: ['$events', '$$event'] }, 1] }],
                    },
                    else: null,
                  },
                },
                toTxHash: {
                  $cond: {
                    if: { $lt: [{ $indexOfArray: ['$events', '$$event'] }, { $subtract: [{ $size: '$events' }, 1] }] },
                    then: {
                      $arrayElemAt: [
                        '$events.transactionHash',
                        { $add: [{ $indexOfArray: ['$events', '$$event'] }, 1] },
                      ],
                    },
                    else: null,
                  },
                },
                pluginAddress: '$$event.pluginAddress',
                pluginSubdomain: '$$event.subdomain',
                tokenAddress: '$$event.tokenAddress',
                daoAddress: '$$event.daoAddress',
                votingPower: '$$event.newVotingPower',
                delegateFromAddress: '$$event.fromDelegate',
                delegateToAddress: '$$event.toDelegate',
              },
            },
          },
        },
      },
    ]

    const history = await Models.LogMember.aggregate(query)

    if (!history || history.length === 0) {
      return
    }

    return history[0]
  },

  async _queryGetMemberMultisigHistory({
                                            memberAddress,
                                          }: {
    memberAddress: HexAddress
  }): Promise<IQueryGetMemberHistory | undefined> {

    const query = [
      {
        $match: {
          address: memberAddress,
          event: { $in: ['MembersAdded', 'MembersRemoved'] },
        },
      },
      {
        $sort: { blockNumber: 1, transactionHash: 1 },
      },
      {
        $group: {
          _id: {
            address: '$address',
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          events: { $push: '$$ROOT' },
        },
      },
      AggregationQueryHelper.logPluginSetupProcessor('$_id.pluginAddress', '$_id.network', 'pluginInfo'),
      AggregationQueryHelper.logPluginRepo('$pluginInfo.pluginSetupRepo', '$pluginInfo.network', 'pluginRepoInfo'),
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          pluginSubdomain: { $arrayElemAt: ['$pluginRepoInfo.subdomain', 0] },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$events',
              initialValue: { isAdded: false, entries: [] },
              in: {
                $cond: {
                  if: { $eq: ['$$this.event', 'MembersAdded'] },
                  then: {
                    isAdded: true,
                    entries: {
                      $concatArrays: [
                        '$$value.entries',
                        [
                          {
                            network: '$network',
                            fromBlockNumber: '$$this.blockNumber',
                            fromTxHash: '$$this.transactionHash',
                            toBlockNumber: null,
                            toTxHash: null,
                            pluginAddress: '$$this.pluginAddress',
                            daoAddress: '$daoAddress',
                            pluginSubdomain: '$pluginSubdomain',
                          },
                        ],
                      ],
                    },
                  },
                  else: {
                    isAdded: false,
                    entries: {
                      $map: {
                        input: '$$value.entries',
                        as: 'entry',
                        in: {
                          $cond: {
                            if: {
                              $and: [
                                { $eq: ['$$entry.pluginAddress', '$$this.pluginAddress'] },
                                { $eq: ['$$entry.toBlockNumber', null] },
                              ],
                            },
                            then: {
                              network: '$$entry.network',
                              fromBlockNumber: '$$entry.fromBlockNumber',
                              fromTxHash: '$$entry.fromTxHash',
                              toBlockNumber: '$$this.blockNumber',
                              toTxHash: '$$this.transactionHash',
                              pluginAddress: '$$entry.pluginAddress',
                              daoAddress: '$$entry.daoAddress',
                              pluginSubdomain: '$$entry.pluginSubdomain',
                            },
                            else: '$$entry',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history.entries' },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $unwind: '$history',
      },
      {
        $sort: {
          'history.toTxHash': -1,
          'history.fromBlockNumber': 1,
        },
      },
      {
        $group: {
          _id: '$_id',
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: 1,
        },
      },
    ]

    const history = await Models.LogMember.aggregate(query)

    if (!history || history.length === 0) {
      return
    }

    return history[0]
  },

  createMember: async (memberLog: LogMember) => {
    const existingLog = await Models.Member.findExistingLog({ address: memberLog.address })

    if (existingLog) {
      return existingLog
    }

    const document: Partial<Member> = {
      address: memberLog.address,
      ens: await EnsHelper.getEnsWithUniversalResolver(memberLog.address),
      avatar: undefined, // TODO: find a way to get the avatar
    }

    const newMember = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.Member.create(document as any, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Create Member', llo({ logId: logDb?.id }))
      return logDb
    })

    return newMember
  },

  memberHistory: async (memberAddress: string) => {

    const [memberTokenVotingHistory, memberMultisigHistory] = await Promise.all([
      AggregatorMember._queryGetMemberTokenVotingHistory({ memberAddress }),
      AggregatorMember._queryGetMemberMultisigHistory({ memberAddress }),
    ]);

    const mergedHistory = [...memberMultisigHistory?.history || [], ...memberTokenVotingHistory?.history || []]

    await Promise.all(mergedHistory.map(async h => {
      const existingHistoryDb = await Models.MemberHistory.findExistingLog({
        memberAddress: memberAddress,
        fromTxHash: h.fromTxHash,
        fromBlockNumber: h.fromBlockNumber,
      })

      if (!existingHistoryDb) {
        await AggregatorMember.createHistory(memberAddress, h)
      } else if (existingHistoryDb && existingHistoryDb.toBlockNumber !== h.toBlockNumber) {
        await AggregatorMember.updateHistory(existingHistoryDb, h)
      }
    }))
  },

  createHistory: async (memberAddress: string, h: IHistoryMember) => {
    const document: Partial<MemberHistory> = {
      network: h.network as NetworksEnum,
      fromBlockNumber: h.fromBlockNumber,
      fromBlockTimestamp: h.fromBlockNumber ? await Web3Helper.getBlockTimestamp(h.fromBlockNumber!, h.network! as NetworksEnum) || undefined : undefined,
      toBlockNumber: h.toBlockNumber!,
      toBlockTimestamp: h.toBlockNumber ? await Web3Helper.getBlockTimestamp(h.toBlockNumber!, h.network! as NetworksEnum) || undefined : undefined,
      fromTxHash: h.fromTxHash,
      toTxHash: h.toTxHash as HexAddress,
      memberAddress,
      daoAddress: h.daoAddress,
      pluginAddress: h.pluginAddress,
      pluginSubdomain: h.pluginSubdomain,
      tokenAddress: h.tokenAddress,
      votingPower: h.votingPower,
      tokenBalance: '0', // TODO: fetch from covalent the token balance at block from/to number
      delegateFromAddress: h.delegateFromAddress,
      delegateToAddress: h.delegateToAddress,
    }

    const newMemberHistory = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.MemberHistory.create(document as any, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Create MemberHistory', llo({ logId: logDb?.id }))
      return logDb
    })

    return newMemberHistory
  },

  updateHistory: async (existingHistoryDb: MemberHistory, h: IHistoryMember) => {
    const document: Partial<MemberHistory> = {
      network: h.network as NetworksEnum,
      fromBlockNumber: h.fromBlockNumber,
      fromBlockTimestamp: h.fromBlockNumber && !existingHistoryDb.fromBlockTimestamp ? await Web3Helper.getBlockTimestamp(h.fromBlockNumber!, h.network! as NetworksEnum) || undefined : undefined,
      toBlockNumber: h.toBlockNumber!,
      toBlockTimestamp: h.toBlockNumber && !existingHistoryDb.toBlockNumber ? await Web3Helper.getBlockTimestamp(h.toBlockNumber!, h.network! as NetworksEnum) || undefined : undefined,
      fromTxHash: h.fromTxHash,
      toTxHash: h.toTxHash as HexAddress,
      votingPower: h.votingPower,
      tokenBalance: '0', // TODO: fetch from covalent the token balance at block from/to number
      delegateFromAddress: h.delegateFromAddress,
      delegateToAddress: h.delegateToAddress,
    }

    const updateMemberHistory = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await existingHistoryDb.update(document as any, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Update MemberHistory', llo({ logId: logDb?.id }))
      return logDb
    })

    return updateMemberHistory
  },

}
