import { Models } from '@dbModels'
import { type HexAddress, IMetricAction, type NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import type MemberBalance from '@models/schema/memberBalance'
import type MemberMetrics from '@models/schema/memberMetrics'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyMember' })

export const ProxyMember = {
  createMember: async (memberAddress: HexAddress): Promise<Member | null> => {
    const parsedMemberAddress = Web3Utils.parseAddress(memberAddress) || memberAddress
    if (!parsedMemberAddress) return null

    const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress })

    if (existingMember) {
      return existingMember
    }

    try {
      const ens = await EnsHelper.getEnsWithUniversalResolver(parsedMemberAddress)

      return await DbTx.executeTxFn(async ({ session }) => {
        const rawMember = {
          address: parsedMemberAddress,
          ens,
        }

        const newMember = await Models.Member.create(rawMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Create document - New Member', llo({ documentId: newMember.id }))
        return newMember
      })
    } catch (error) {
      logger.error('Error creating new member', llo({ error, memberAddress: parsedMemberAddress }))
      return null
    }
  },

  createMetrics: async ({
    address,
    pluginAddress,
    network,
  }: {
    address: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberMetrics | null> => {
    try {
      const memberAddress = Web3Utils.parseAddress(address)
      if (!memberAddress) {
        return null
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const metrics = await Models.MemberMetrics.findOne({ address: memberAddress, pluginAddress, network }, null, {
          session,
        })

        if (metrics) {
          return metrics
        }

        const rawMetrics = { address: memberAddress, pluginAddress, network }

        const newMetrics = await Models.MemberMetrics.create(rawMetrics, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Create document - New MemberMetrics', llo({ documentId: newMetrics.id }))
        return newMetrics
      })
    } catch (error) {
      logger.error('Error creating new member metrics', llo({ error, address, pluginAddress }))
      return null
    }
  },

  getBalances: async ({
    address,
    tokenAddress,
    network,
  }: {
    address: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberBalance | null> => {
    try {
      const memberAddress = Web3Utils.parseAddress(address)
      if (!memberAddress) {
        return null
      }
      return await DbTx.executeTxFn(async ({ session }) => {
        const token = await Models.MemberBalance.findByAddressAndToken(
          { address: memberAddress, tokenAddress, network },
          { session },
        )

        if (token) {
          return token
        }

        const data = { address: memberAddress, tokenAddress, network }
        const memberBalance = await Models.MemberBalance.create(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Create document - New MemberBalance', llo({ documentId: memberBalance.id }))
        return memberBalance
      })
    } catch (error) {
      logger.error('Error getting member balances', llo({ error, address, tokenAddress }))
      return null
    }
  },

  updateActivity: async ({
    memberAddress,
    pluginAddress,
    blockNumber,
    network,
  }: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    blockNumber: number
    network: NetworksEnum
  }): Promise<Member | null> => {
    try {
      const [member, memberMetrics, blockTimestamp] = await Promise.all([
        ProxyMember.createMember(memberAddress),
        ProxyMember.createMetrics({
          address: memberAddress,
          pluginAddress,
          network,
        }),
        Web3Helper.getBlockTimestamp(blockNumber, network),
      ])

      if (!member || !memberMetrics) return null

      const updateFields: Partial<Member> = {
        lastActivity: blockTimestamp,
      }

      if (!member?.firstActivity) {
        updateFields.firstActivity = blockTimestamp
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const updatedMember = await memberMetrics?.update(updateFields, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Member activity', llo({ documentId: updatedMember.id }))
        return updatedMember
      })
    } catch (error) {
      logger.error('Error updating member activity', llo({ error, memberAddress, pluginAddress, blockNumber, network }))
      return null
    }
  },

  updateDelegationMetrics: async ({
    memberAddress,
    pluginAddress,
    tokenAddress,
    network,
  }: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberMetrics | undefined | null> => {
    const address = Web3Utils.parseAddress(memberAddress)
    if (!address) return null

    const metrics = await ProxyMember.createMetrics({
      address,
      pluginAddress,
      network,
    })

    if (!metrics) {
      logger.error('Failed to create metrics', llo({ memberAddress, pluginAddress, tokenAddress, network }))
      return
    }

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const delegateReceivedCount = await Models.MemberTransaction.getReceiveDelegationCount(
          address,
          tokenAddress,
          network,
          { session },
        )
        const logDb = await metrics.update({ delegateReceivedCount }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated Member DAO metrics', { logId: logDb.id })
        return logDb
      })
    } catch (error) {
      logger.error(
        'Error updating delegation metrics',
        llo({
          error,
          address,
          pluginAddress,
          tokenAddress,
          network,
        }),
      )
    }
  },

  updateMetricsByAction: async (
    metricAction: IMetricAction,
    {
      memberAddress,
      pluginAddress,
      network,
    }: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
    },
  ) => {
    const address = Web3Utils.parseAddress(memberAddress)
    if (!address) return null

    const metrics = await ProxyMember.createMetrics({
      address,
      pluginAddress,
      network,
    })

    if (!metrics) return

    const metricActionsMap = {
      [IMetricAction.increaseProposalCount]: metrics.increaseProposalCount,
      [IMetricAction.increaseVoteCount]: metrics.increaseVoteCount,
      [IMetricAction.increaseDelegateReceivedCount]: metrics.increaseDelegateReceivedCount,
      [IMetricAction.decreaseDelegateReceivedCount]: metrics.decreaseDelegateReceivedCount,
    }

    const metricUpdateFn = metricActionsMap[metricAction]

    if (metricUpdateFn) {
      try {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await metricUpdateFn.call(metrics, 1, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Updated Member DAO metrics', { logId: logDb.id })
        })
      } catch (error) {
        logger.error('Error updating member metrics', llo({ error, address, pluginAddress, network }))
      }
    } else {
      logger.error('Unsupported metric action', llo({ metricAction, address, pluginAddress, network }))
    }
  },

  addToDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress?: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(memberAddress)
    if (!member) {
      logger.error('Failed to add member to dao', llo({ params }))
      return null
    }

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const queryParams = {
          memberAddress,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          tokenAddress: params?.tokenAddress,
          network: params.network,
        }
        const existingDao = await ProxyMember.isMemberOfDao(queryParams, session)
        if (!existingDao) {
          await Models.DaoMemberMapping.create(queryParams, { session })
          await session.commitTransaction()
          await session.endSession()
        }
        return member
      })
    } catch (error) {
      logger.error('Error in addToDao', llo({ error, params }))
      return null
    }
  },

  removeFromDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress?: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(memberAddress)

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const queryParams = {
          memberAddress,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          tokenAddress: params?.tokenAddress,
          network: params.network,
        }
        const existingDao = await ProxyMember.isMemberOfDao(queryParams, session)

        if (existingDao) {
          const logDb = await existingDao.removeSelf({ session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Remove DaoMemberMapping', llo({ logId: logDb.id }))
        }

        return member
      })
    } catch (error) {
      logger.error('Error in removeFromDao', llo({ error, params }))
      return null
    }
  },

  isMemberOfDao: async (
    params: {
      memberAddress: HexAddress
      daoAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
      tokenAddress?: HexAddress
    },
    session?: any,
  ) => {
    return Models.DaoMemberMapping.findMapping(params, { session })
  },
}
