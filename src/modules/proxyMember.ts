import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, IMetricAction, type NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import type Member from '@models/schema/member'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyMember' })

export const ProxyMember = {
  createMember: async (memberAddress: HexAddress): Promise<Member> => {
    const parsedMemberAddress = Web3Helper.parseAddress(memberAddress) || memberAddress

    return await DbTx.executeTxFn(async ({ session }) => {
      const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress }, { session })

      if (!existingMember) {
        const rawMember = {
          address: memberAddress,
          ens: await EnsHelper.getEnsWithUniversalResolver(memberAddress),
        }

        const newMember = await Models.Member.create(rawMember, { session })

        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Create document - New Member', llo({ documentId: newMember.id }))
        return newMember
      }

      return existingMember
    })
  },

  createMetrics: async ({
    address,
    pluginAddress,
    network,
  }: {
    address: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }) => {

    return await DbTx.executeTxFn(async ({ session }) => {
      const metrics = await Models.MemberMetrics.findOne({ address, pluginAddress, network }, null, {session})

      if (metrics) {
        return metrics
      }

      const rawMetrics = { address, pluginAddress, network }
      const newMetrics = await Models.MemberMetrics.create(rawMetrics, { session })

      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Create document - New MemberMetrics', llo({ documentId: newMetrics.id }))
      return newMetrics
    })
  },

  getBalances: async ({
    address,
    tokenAddress,
    network,
  }: {
    address: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }) => {
    return await DbTx.executeTxFn(async ({ session }) => {
      const token = await Models.MemberBalance.findByAddressAndToken({ address, tokenAddress, network }, { session })

      if (token) {
        return token
      }

      const data = { address, tokenAddress, network }
      const newMetrics = await Models.MemberBalance.create(data, { session })

      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Create document - New MemberBalance', llo({ documentId: newMetrics.id }))
      return newMetrics
    })
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
  }): Promise<Member> => {
    const [member, memberMetrics, blockTimestamp] = await Promise.all([
      ProxyMember.createMember(memberAddress),
      ProxyMember.createMetrics({
        address: memberAddress,
        pluginAddress,
        network,
      }),
      Web3Helper.getBlockTimestamp(blockNumber, network),
    ])

    const updateFields: Partial<Member> = {
      lastActivity: blockTimestamp,
    }

    if (!member.firstActivity) {
      updateFields.firstActivity = blockTimestamp
    }

    return await DbOperations.updateDocument(
      memberMetrics,
      updateFields,
      { logId: member.id },
      'Update Member activity',
      llo,
    )
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
  ): Promise<Member> => {
    const metrics = await ProxyMember.createMetrics({
      address: memberAddress,
      pluginAddress,
      network,
    })

    const metricActionsMap = {
      [IMetricAction.increaseProposalCount]: metrics.increaseProposalCount,
      [IMetricAction.increaseVoteCount]: metrics.increaseVoteCount,
      [IMetricAction.increaseDelegateReceivedCount]: metrics.increaseDelegateReceivedCount,
      [IMetricAction.increaseDelegateSentCount]: metrics.increaseDelegateSentCount,
    }

    const metricUpdateFn = metricActionsMap[metricAction]

    if (metricUpdateFn) {
      const updatedMetrics = await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await metricUpdateFn.call(metrics, 1, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated Member DAO metrics', { logId: logDb.id })
        return logDb
      })

      return updatedMetrics
    }

    return metrics
  },

  addToDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Helper.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(params.memberAddress)

    const queryParams = {
      memberAddress: params.memberAddress,
      daoAddress: params.daoAddress,
      pluginAddress: params.pluginAddress,
      network: params.network,
    }
    const existingDao = await Models.DaoMemberMapping.findMapping(queryParams)

    if (existingDao) {
      return member
    }

    await DbOperations.createDocument(
      Models.DaoMemberMapping,
      queryParams,
      { logId: member.id },
      'New DaoMemberMapping',
      llo,
    )

    return member
  },

  removeFromDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Helper.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(params.memberAddress)

    const queryParams = {
      memberAddress: params.memberAddress,
      daoAddress: params.daoAddress,
      pluginAddress: params.pluginAddress,
      network: params.network,
    }
    const existingDao = await Models.DaoMemberMapping.findMapping(queryParams)

    if (existingDao) {
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await existingDao.removeSelf({ session })
        await session.commitTransaction()
        logger.verbose('Remove DaoMemberMapping', llo({ logId: logDb.id }))
      })
    }

    return member
  },
}
