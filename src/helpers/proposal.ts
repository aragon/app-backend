import { Multisig } from '@artifacts/Multisig'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { TokenVoting } from '@artifacts/TokenVoting'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type ILogInfo,
  IMultiSigLogs,
  IPluginInterfaceType,
  type IProposalMultisigOnChain,
  type IProposalOnChain,
  type IProposalSPPOnChain,
  type IProposalTokenVotingOnChain,
  type IReportResultType,
  ITokenVotingLogs,
  type NetworksEnum,
  type OutOfOrderProposalEvent,
} from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProposalHelper' })

const ProposalHelper = {
  async getProposal({
    plugin,
    proposalIndex,
    network,
  }: {
    plugin: Plugin
    proposalIndex: string
    network: NetworksEnum
  }): Promise<IProposalOnChain> {
    if (plugin.interfaceType === IPluginInterfaceType.tokenVoting) {
      return await ProposalHelper.getProposalTokenVoting({ proposalIndex, pluginAddress: plugin.address, network })
    } else if (plugin.interfaceType === IPluginInterfaceType.multisig) {
      return await ProposalHelper.getProposalMultisig({ proposalIndex, pluginAddress: plugin.address, network })
    } else if (plugin.interfaceType === IPluginInterfaceType.spp) {
      return await ProposalHelper.getProposalSpp({ proposalIndex, pluginAddress: plugin.address, network })
    } else {
      return null
    }
  },

  async getBodyResult(
    proposalIndex: string,
    stage: number,
    sppPluginAddress: HexAddress,
    subPluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<IReportResultType | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sppPluginAddress, StagedProposalProcessor.abi, provider)
    try {
      const resultType = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getBodyResult(proposalIndex, stage, subPluginAddress),
        ),
      )

      return Number(resultType)
    } catch (error) {
      logger.error(
        'Error getting body result SPP',
        llo({ proposalIndex, sppPluginAddress, subPluginAddress, network, error }),
      )
      return null
    }
  },

  async getSppSubPluginProposals(
    proposalIndex: string,
    stage: number,
    pluginAddress: HexAddress,
    sppPluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<number | false> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sppPluginAddress, StagedProposalProcessor.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getBodyProposalId(proposalIndex, stage, pluginAddress),
        ),
      )
    } catch (_error) {
      return false
    }
  },

  async getProposalSpp({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: string
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalSPPOnChain | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(pluginAddress, StagedProposalProcessor.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getProposal(proposalIndex)),
      )
    } catch (error) {
      logger.error('Error getting proposal SPP', llo({ proposalIndex, pluginAddress, network, error }))
    }
    return null
  },

  async getProposalTokenVoting({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: string
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalTokenVotingOnChain | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, TokenVoting.abi, provider)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getProposal(proposalIndex)),
      )
    } catch (error) {
      logger.error('Error getting proposal tokenVoting', llo({ proposalIndex, pluginAddress, network, error }))
      return null
    }
  },

  async getProposalMultisig({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: string
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalMultisigOnChain | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(pluginAddress, Multisig.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getProposal(proposalIndex)),
      )
    } catch (error) {
      logger.error('Error getting proposal multisig', llo({ proposalIndex, pluginAddress, network, error }))
      return null
    }
  },

  /**
   * Finds Approved / VoteCast / ProposalExecuted events emitted *before* ProposalCreated in the
   * same transaction (out-of-order). This happens on multisig approveProposal/tryExecution,
   * tokenVoting tryEarlyExecution and admin auto-execution — the relevant handler runs first,
   * finds no proposal yet, and drops the event. Plugin-agnostic: only topics actually present in
   * the tx match, so a multisig tx never yields VoteCast and vice-versa. Returns the parsed events
   * (with their own log position) for the caller to re-drive through the normal handlers.
   */
  findOutOfOrderProposalEvents: async (
    info: ILogInfo,
    pluginAddress: string,
    proposalIndex: string,
  ): Promise<OutOfOrderProposalEvent[]> => {
    if (!info.context) return []

    const txLogs = await info.context.getLogsByTxHash(info.transactionHash)
    const multisigIFace = new Interface(Multisig.abi)
    const tokenVotingIFace = new Interface(TokenVoting.abi)
    const dispatch: Record<string, { kind: OutOfOrderProposalEvent['kind']; iface: Interface }> = {}
    const register = (topic: string | undefined, kind: OutOfOrderProposalEvent['kind'], iface: Interface) => {
      if (topic) dispatch[topic] = { kind, iface }
    }
    register(multisigIFace.getEvent(ITokenVotingLogs.ProposalExecuted)?.topicHash, 'proposalExecuted', multisigIFace)
    register(multisigIFace.getEvent(IMultiSigLogs.Approved)?.topicHash, 'approved', multisigIFace)
    register(tokenVotingIFace.getEvent(ITokenVotingLogs.VoteCast)?.topicHash, 'voteCast', tokenVotingIFace)

    const events: OutOfOrderProposalEvent[] = []
    for (const log of txLogs) {
      if (log.address?.toLowerCase() !== pluginAddress.toLowerCase()) continue
      if (log.index >= info.logIndex) continue

      const entry = dispatch[log.topics[0]]
      if (!entry) continue

      try {
        const parsed = entry.iface.parseLog({ topics: log.topics as string[], data: log.data })
        if (parsed && parsed.args.proposalId.toString() === proposalIndex) {
          events.push({
            kind: entry.kind,
            parsed,
            info: { ...info, transactionIndex: log.transactionIndex, logIndex: log.index },
          })
        }
      } catch {}
    }
    return events
  },
}

export default ProposalHelper
