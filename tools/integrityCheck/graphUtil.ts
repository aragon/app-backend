import { type HexAddress, NetworksEnum } from '@types'
import axios from 'axios'
import { ethers } from 'ethers'

const URL = 'https://n-app-backend.aragon.org/graphql'

const IntegrityUtil = {
  networkToGraphNetwork: (network: NetworksEnum) => {
    const networkMap = {
      [NetworksEnum.polygonMainnet]: 'polygon',
      [NetworksEnum.ethereumMainnet]: 'ethereum',
      [NetworksEnum.ethereumSepolia]: 'sepolia',
    }

    return networkMap[network]
  },

  constructGraphUrl(network: NetworksEnum) {
    const base = 'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-'
    const suffix = '/version/1.4.2/api'
    const networkMap = {
      [NetworksEnum.polygonMainnet]: 'polygon',
      [NetworksEnum.ethereumMainnet]: 'mainnet',
      [NetworksEnum.ethereumSepolia]: 'sepolia',
    }

    return `${base}${networkMap[network]}${suffix}`
  },

  async getMembersFromGraphOfToken(network: NetworksEnum, tokenAddress: HexAddress) {
    const query = `
      query Holders($network: Network!, $tokenAddress: String!) {
        holders(network: $network, tokenAddress: $tokenAddress) {
          contractAddress
          contractDecimals
          contractName
          contractTickerSymbol
          hasMore
          holders {
            address
            balance
            delegates
            votes
          }
          logoUrl
          network
          supportsErc
          totalHolders
          totalSupply
          updatedAt
        }
      }
    `

    const variables = {
      network: IntegrityUtil.networkToGraphNetwork(network),
      tokenAddress: tokenAddress.toLowerCase(),
    }

    return await axios.post(URL, { query, variables })
  },

  async getMultisigBasedMembersFromGraph(network: NetworksEnum, pluginAddress: HexAddress) {
    const url = IntegrityUtil.constructGraphUrl(network)

    const query = `
      query MultisigMembers($where: MultisigApprover_filter!) {
        multisigApprovers(
          where: $where
        ) {
          address
          isActive
        }
      }
    `

    const variables = {
      where: { plugin: pluginAddress.toLowerCase() },
    }

    return await axios.post(url, { operationName: 'MultisigMembers', query, variables })
  },

  async getProposalCountForTokenVoting(network: NetworksEnum, plugin: HexAddress) {
    const url = IntegrityUtil.constructGraphUrl(network)

    const query = `
      query TokenVotingProposalCount($pluginAddress: ID!) {
        tokenVotingPlugin(id: $pluginAddress) {
          proposalCount
        }
      }
    `

    const variables = {
      pluginAddress: plugin.toLowerCase(),
    }

    return await axios.post(url, { query, variables })
  },

  async getProposalCountForMultisigVoting(network: NetworksEnum, plugin: HexAddress) {
    const url = IntegrityUtil.constructGraphUrl(network)

    const query = `
      query MultisigProposalCount($pluginAddress: ID!) {
        multisigPlugin(id: $pluginAddress) {
          proposalCount
        }
     }`

    const variables = {
      pluginAddress: plugin.toLowerCase(),
    }

    return await axios.post(url, { query, variables })
  },

  async getMultisigProposalInfoFromGraph(network: NetworksEnum, plugin: HexAddress, proposalId: string) {
    const query = `
      query MultisigProposal($proposalId: ID!) {
        multisigProposal(id: $proposalId) {
          id
          minApprovals
          executionTxHash
          executed
          approvalReached
          isSignaling
          approvals(first: 1000) {
            id
            approver {
              address
            }
          }
        }
      }
    `

    const variables = {
      proposalId: `${plugin.toLowerCase()}_${ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [proposalId])}`,
    }

    const url = IntegrityUtil.constructGraphUrl(network)
    return await axios.post(url, { query, variables, operationName: 'MultisigProposal' })
  },

  async getTokenVotingProposalInfoFromGraph(network: NetworksEnum, plugin: HexAddress, proposalId: string) {
    const query = `
      query TokenVotingProposal($proposalId: ID!) {
        tokenVotingProposal(id: $proposalId) {
          id
          voters(first: 1000) {
            voter {
              address
            }
            voteReplaced
            voteOption
            votingPower
          }
          totalVotingPower
          minVotingPower
        }
      }
    `

    const variables = {
      proposalId: `${plugin.toLowerCase()}_${ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [proposalId])}`,
    }

    const url = IntegrityUtil.constructGraphUrl(network)

    return await axios.post(url, { query, variables, operationName: 'TokenVotingProposal' })
  },
}

export default IntegrityUtil
