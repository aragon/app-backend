import {
  type HexAddress,
  type IProposalMultisigOnChain,
  type IProposalOnChain,
  type IProposalSPPOnChain,
  type IProposalTokenVotingOnChain,
  IPluginInterfaceType,
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

const llo = logger.logMeta.bind(null, { service: 'helpers:ProposalHelper' })

const ProposalHelper = {
  async getProposal({
    proposalIndex,
    pluginAddress,
    proposalType,
    network,
  }: {
    proposalIndex: number
    pluginAddress: HexAddress
    proposalType: IPluginInterfaceType
    network: NetworksEnum
  }): Promise<IProposalOnChain> {
    if (proposalType === IPluginInterfaceType.tokenVoting) {
      return await ProposalHelper.getProposalTokenVoting({ proposalIndex, pluginAddress, network })
    } else if (proposalType === IPluginInterfaceType.multisig) {
      return await ProposalHelper.getProposalMultisig({ proposalIndex, pluginAddress, network })
    } else if (proposalType === IPluginInterfaceType.spp) {
      return await ProposalHelper.getProposalSpp({ proposalIndex, pluginAddress, network })
    } else {
      return null
    }
  },

  async getProposalSpp({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: number
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalSPPOnChain | null> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(pluginAddress, StagedProposalProcessor.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getProposal(proposalIndex)),
      )
    } catch (error) {
      logger.error('Error getting proposal SPP', llo({ proposalIndex, pluginAddress, network, error }))
      return null
    }
  },

  async getProposalTokenVoting({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: number
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalTokenVotingOnChain | null> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(pluginAddress, TokenVoting.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getProposal(proposalIndex)),
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
    proposalIndex: number
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<IProposalMultisigOnChain | null> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(pluginAddress, Multisig.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getProposal(proposalIndex)),
      )
    } catch (error) {
      logger.error('Error getting proposal multisig', llo({ proposalIndex, pluginAddress, network, error }))
      return null
    }
  },
}

export default ProposalHelper
