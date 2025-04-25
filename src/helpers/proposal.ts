import {
  type HexAddress,
  IPluginInterfaceType,
  type IProposalMultisigOnChain,
  type IProposalOnChain,
  type IProposalSPPOnChain,
  type IProposalTokenVotingOnChain,
  type IReportResultType,
  type NetworksEnum,
} from '@types'
import { Contract } from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import type Plugin from '@models/schema/plugin'

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
    } catch (error) {
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
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(pluginAddress, TokenVoting.abi, provider)
    try {
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
}

export default ProposalHelper
