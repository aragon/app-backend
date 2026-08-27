import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type Proposal from '@models/schema/proposal'
import type Vote from '@models/schema/vote'
import DbOperations from '@models/utils/dbOperations'
import { MemberGovernanceFactory } from '@src/governance'
import { EnumQueueName, type HexAddress, type ILogInfo, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:MultisigHelper' })

const MultisigHelper = {
  findSettings: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ minApprovals: number; onlyListed: boolean } | undefined> => {
    const settings = await Web3Helper.getMultisigSettings(pluginAddress, network)

    const onlyListed = settings?.onlyListed || false
    const minApprovals: any = Number(settings?.minApprovals || 0)

    if (settings?.minApprovals) {
      return { minApprovals, onlyListed }
    }

    logger.error('MinApprovals not found', llo({ pluginAddress, network }))
  },

  /**
   * Core logic for processing an Approved event once the proposal is known to exist.
   * Used by both the approved handler and the out-of-order catch-up in proposalCreated.
   */
  processApproval: async (
    parsedEvent: LogDescription,
    info: ILogInfo,
    proposal: Proposal,
    plugin: Plugin,
  ): Promise<void> => {
    const proposalIndex = parsedEvent.args.proposalId.toString()

    const existingLog = await Models.Vote.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    if (existingLog) return

    const document: Partial<Vote> = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      daoAddress: proposal.daoAddress,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.approver,
      proposalIndex,
    }

    await DbOperations.createDocument(Models.Vote, document, info, 'New Vote - Approved', llo)

    await MemberGovernanceFactory.createBaseMember(document.memberAddress!, info.blockNumber)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin)

    await governance.updatePluginMetrics({
      memberAddress: document.memberAddress!,
      pluginAddress: info.address,
      network: info.network,
      daoAddress: proposal.daoAddress,
      lastActivity: info.blockNumber,
    })

    await governance.updateDaoMetrics()

    await RabbitMQHelper.sendMessage(EnumQueueName.proposalMultisigMetrics, {
      id: `${proposalIndex}-${info.address}`,
      params: { proposalIndex, pluginAddress: info.address, network: proposal.network },
    })
  },
}

export default MultisigHelper
