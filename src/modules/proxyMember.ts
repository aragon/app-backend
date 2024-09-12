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
  saveAndGetMember: async (memberAddress: HexAddress): Promise<Member> => {
    const parsedMemberAddress = Web3Helper.parseAddress(memberAddress) || memberAddress
    const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress })

    if (existingMember) {
      return existingMember
    }

    const rawMember = {
      address: memberAddress,
      ens: await EnsHelper.getEnsWithUniversalResolver(memberAddress),
    }

    const memberDb = await DbTx.executeTxFn(
      async ({ session }) => {
        const logDb = await Models.Member.create(rawMember, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Member', llo({ logId: logDb.id }))
        return logDb
      },
      { stopRetry: true },
    )

    return memberDb
  },

  getMemberMetrics: async ({
    address,
    pluginAddress,
    network,
  }: {
    address: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }) => {
    const metrics = await Models.MemberMetrics.findOne({ address, pluginAddress, network })

    if (!metrics) {
      const data = { address, pluginAddress, network }
      return await DbOperations.createDocument(Models.MemberMetrics, data, data, 'New Member metrics', llo)
    }

    return metrics
  },

  memberActivity: async ({
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
    return await DbTx.executeTxFn(async ({ session }) => {
      const [member, memberMetrics, blockTimestamp] = await Promise.all([
        ProxyMember.saveAndGetMember(memberAddress),
        ProxyMember.getMemberMetrics({
          address: memberAddress,
          pluginAddress,
          network,
        }),
        Web3Helper.getBlockTimestamp(blockNumber, network),
      ])

      // Update member activity
      const updateFields: Partial<Member> = {
        lastActivity: blockTimestamp,
      }

      if (!member.firstActivity) {
        updateFields.firstActivity = blockTimestamp
      }

      await memberMetrics.update(updateFields, { session })

      await session.commitTransaction()
      session.endSession()

      logger.verbose('Member activity updated', { logId: member.id })

      return member
    })
  },

  updateMemberMetrics: async (
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
    const metrics = await ProxyMember.getMemberMetrics({
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

  getBalances: async ({
    address,
    tokenAddress,
    network,
  }: {
    address: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }) => {
    const tokenBalance = await Models.MemberBalance.getOrCreateTokenBalance({ address, tokenAddress, network })
    return tokenBalance
  },

  addToDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<Member> => {
    const member = await ProxyMember.saveAndGetMember(params.memberAddress)

    const queryParams = {
      memberAddress: member.address,
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
  }): Promise<Member> => {
    const member = await ProxyMember.saveAndGetMember(params.memberAddress)

    const queryParams = {
      memberAddress: member.address,
      daoAddress: params.daoAddress,
      pluginAddress: params.pluginAddress,
      network: params.network,
    }
    const existingDao = await Models.DaoMemberMapping.findMapping(queryParams)

    if (existingDao) {
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await existingDao.removeSelf({ session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Remove DaoMemberMapping', llo({ logId: logDb.id }))
      })
    }

    return member
  },
}
