import { EnumConnection, IMetricAction, type IService, ITransferSide, ITransferType } from '@types'
import { Models } from '@dbModels'
import type Member from '@models/schema/member'
import type Plugin from '@models/schema/plugin'
import utils from '@helpers/utils'
import logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'Tools: MemberMetrics' })

export interface IExtendedService extends IService {
  delegationCount: (member: Member) => Promise<void>
  proposalCount: (member: Member) => Promise<void>
  voteCount: (member: Member) => Promise<void>
  setActivity: (member: Member, plugin: Plugin, blockTimestamp: number) => Promise<void>
}

export const ToolsMemberMetrics: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    let count = 0
    const members = await Models.Member.find()

    // delegate received
    await Promise.all(
      members.map(async (member: Member) => {
        await ToolsMemberMetrics.delegationCount(member)

        await ToolsMemberMetrics.proposalCount(member)

        await ToolsMemberMetrics.voteCount(member)
        count++
        logger.info(`Member ${count} of ${members.length}`, llo())
      }),
    )

    logger.info('End Delegation count updated', llo())
  },

  delegationCount: async (member: Member) => {
    // delegate received
    const receivedTxs = await Models.MemberTransaction.find({
      address: member.address,
      side: ITransferSide.incoming,
      type: ITransferType.delegate,
      from: { $ne: utils.zeroAddress },
      to: member.address,
    })

    for (const received of receivedTxs) {
      const plugins = await Models.Plugin.find({ isSupported: true, tokenAddress: received.tokenAddress })

      for (const plugin of plugins) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: plugin.network,
        })
        await ToolsMemberMetrics.setActivity(member, plugin, received.blockTimestamp)
      }
    }

    // delegate sent
    const sentTxs = await Models.MemberTransaction.find({
      address: member.address,
      side: ITransferSide.outgoing,
      type: ITransferType.delegate,
      from: member.address,
      to: { $ne: utils.zeroAddress },
    })

    for (const sent of sentTxs) {
      const plugins = await Models.Plugin.find({ isSupported: true, tokenAddress: sent.tokenAddress })

      for (const plugin of plugins) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateSentCount, {
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: plugin.network,
        })
        await ToolsMemberMetrics.setActivity(member, plugin, sent.blockTimestamp)
      }
    }
  },

  proposalCount: async (member: Member) => {
    const proposals = await Models.Proposal.find({ creatorAddress: member.address })

    for (const proposal of proposals) {
      const plugin = await Models.Plugin.findOne({ address: proposal.pluginAddress, network: proposal.network })
      if (!plugin) continue
      await ProxyMember.updateMetricsByAction(IMetricAction.increaseProposalCount, {
        memberAddress: member.address,
        pluginAddress: plugin.address,
        network: plugin.network,
      })
      await ToolsMemberMetrics.setActivity(member, plugin, proposal.blockTimestamp)
    }
  },

  voteCount: async (member: Member) => {
    const votes = await Models.Vote.find({
      memberAddress: member.address,
      replacedTransactionHash: null, // not count replaced votes
    })

    for (const vote of votes) {
      const plugin = await Models.Plugin.findOne({ address: vote.pluginAddress, network: vote.network })
      if (!plugin) return

      await ProxyMember.updateMetricsByAction(IMetricAction.increaseVoteCount, {
        memberAddress: member.address,
        pluginAddress: plugin.address,
        network: plugin.network,
      })
      await ToolsMemberMetrics.setActivity(member, plugin, vote.blockTimestamp)
    }
  },

  setActivity: async (member: Member, plugin: Plugin, blockTimestamp: number) => {
    const memberMetrics = await Models.MemberMetrics.findOne({
      address: member.address,
      pluginAddress: plugin.address,
      network: plugin.network,
    })

    if (!memberMetrics) {
      logger.error('memberMetrics not found', llo({ member, plugin, blockTimestamp }))
      return
    }

    const updateFields: Partial<Member> = {}

    if (!memberMetrics.firstActivity || memberMetrics.firstActivity > blockTimestamp) {
      updateFields.firstActivity = blockTimestamp
    }

    if (!memberMetrics.lastActivity || memberMetrics.lastActivity < blockTimestamp) {
      updateFields.lastActivity = blockTimestamp
    }

    if (Object.keys(updateFields).length > 0) {
      await DbOperations.updateDocument(
        memberMetrics,
        updateFields,
        { logId: member.id },
        'Update Member activity',
        llo,
      )
    }
  },

  stop: async () => {},
}

export default ToolsMemberMetrics
