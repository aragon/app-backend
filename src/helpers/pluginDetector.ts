import { keccak256, ZeroAddress } from 'ethers'
import { type IPluginInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'

export const SPP_FUNCTIONS = ['getStages(uint256)']

export const TOKEN_VOTING_FUNCTIONS = ['getVotingToken()', 'totalVotingPower(uint256)']

export const MULTISIG_FUNCTIONS = ['isMember(address)', 'isListed(address)']

export const ADMIN_FUNCTIONS = ['isMember(address)']

export const GAUGE_VOTER_FUNCTIONS = [
  'createGauge(address,string)',
  'deactivateGauge(address)',
  'activateGauge(address)',
  'updateGaugeMetadata(address,string)',
  'votingActive()',
  'epochStart()',
  'epochVoteStart()',
  'epochVoteEnd()',
]

const allFunctions = [
  ...SPP_FUNCTIONS,
  ...MULTISIG_FUNCTIONS,
  ...TOKEN_VOTING_FUNCTIONS,
  ...ADMIN_FUNCTIONS,
  ...GAUGE_VOTER_FUNCTIONS,
]

const functionHashes = allFunctions.reduce<Record<string, string>>((acc, func) => {
  acc[func] = keccak256(Buffer.from(func)).slice(0, 10)
  return acc
}, {})

async function detectPluginType(address: string, network: NetworksEnum): Promise<IPluginInfo | null> {
  if (address === ZeroAddress) {
    return {
      type: IPluginInterfaceType.unknown,
      proxy: false,
      implementationAddress: null,
    }
  }

  const provider = ProviderModule.getProvider(network)!
  let contractAddress = address

  // Check if the contract is a proxy and get the implementation address
  const implementationAddress = await ProxyContractHelper.getImplementationAddress(address, network)
  if (implementationAddress) {
    contractAddress = implementationAddress
  }

  const contractDetails = {
    proxy: !!implementationAddress,
    implementationAddress: implementationAddress || null,
    type: IPluginInterfaceType.unknown,
  }

  try {
    const bytecode = await provider.getCode(contractAddress)
    if (!bytecode || bytecode === '0x') {
      return contractDetails
    }

    function hasFunction(signature: string): boolean {
      const functionHash = functionHashes[signature]
      return functionHash ? bytecode.includes(functionHash.replace('0x', '')) : false
    }

    function hasFunctions(functions: string[]): boolean {
      return functions.every(hasFunction)
    }

    if (hasFunctions(TOKEN_VOTING_FUNCTIONS)) {
      contractDetails.type = IPluginInterfaceType.tokenVoting
    } else if (hasFunctions(SPP_FUNCTIONS)) {
      contractDetails.type = IPluginInterfaceType.spp
    } else if (hasFunctions(MULTISIG_FUNCTIONS)) {
      contractDetails.type = IPluginInterfaceType.multisig
    } else if (hasFunctions(ADMIN_FUNCTIONS)) {
      contractDetails.type = IPluginInterfaceType.admin
    } else if (hasFunctions(GAUGE_VOTER_FUNCTIONS)) {
      contractDetails.type = IPluginInterfaceType.gauge
    } else {
      contractDetails.type = IPluginInterfaceType.unknown
    }

    return contractDetails
  } catch (error) {
    return contractDetails
  }
}

export default {
  detectPluginType,
  functionHashes,
}
