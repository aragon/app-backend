import {
  type HexAddress,
  type IProposalMultisigOnChain,
  type IProposalOnChain,
  type IProposalTokenVotingOnChain,
  IProposalType,
  type NetworksEnum,
} from '@types'
import { Contract } from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'

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
    proposalType: IProposalType
    network: NetworksEnum
  }): Promise<IProposalOnChain> {
    if (proposalType === IProposalType.tokenVoting) {
      return await ProposalHelper.getProposalTokenVoting({ proposalIndex, pluginAddress, network })
    } else {
      return await ProposalHelper.getProposalMultisig({ proposalIndex, pluginAddress, network })
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
      return await retryRequest(
        async () => BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getProposal(proposalIndex)),
        { maxRetries: 3, forceRetry: true },
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
      return await retryRequest(
        async () => BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getProposal(proposalIndex)),
        { maxRetries: 3, forceRetry: true },
      )
    } catch (error) {
      logger.error('Error getting proposal multisig', llo({ proposalIndex, pluginAddress, network, error }))
      return null
    }
  },
}

export default ProposalHelper
