import { keccak256, ZeroAddress } from 'ethers'
import { VotingBodyBrandIdentity, type IPluginInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import logger from '@logger'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'helper:PluginDetector' })

const PluginDetector = {
  SPP_FUNCTIONS: ['getStages(uint256)'],
  TOKEN_VOTING_FUNCTIONS: ['getVotingToken()', 'totalVotingPower(uint256)'],
  MULTISIG_FUNCTIONS: ['isMember(address)', 'isListed(address)', 'multisigSettings()'],
  ADMIN_FUNCTIONS: ['isMember(address)'],
  GAUGE_VOTER_FUNCTIONS: [
    'createGauge(address,string)',
    'deactivateGauge(address)',
    'activateGauge(address)',
    'updateGaugeMetadata(address,string)',
    'votingActive()',
    'epochStart()',
    'epochVoteStart()',
    'epochVoteEnd()',
  ],
  HAS_TARGET: ['getTargetConfig()'],
  SAFE_WALLET: 'masterCopy()',
  LOCK_TO_VOTE_FUNCTIONS: [
    'usedVotingPower(uint256,address)',
    'currentTokenSupply()',
    'clearVote(uint256,address)',
    'lockManager()',
  ],
  CAPITAL_DISTRIBUTION_FUNCTIONS: [
    'getCampaign(uint256)',
    'getCampaignStrategyId(uint256)',
    'getCampaignPayout(uint256,address,bytes)',
  ],

  _generateFunctionHash(functionSignature: string): string {
    return keccak256(Buffer.from(functionSignature)).slice(0, 10)
  },

  async detectPluginType(address: string, network: NetworksEnum): Promise<IPluginInfo> {
    if (address === ZeroAddress) {
      return {
        type: IPluginInterfaceType.unknown,
        proxy: false,
        implementationAddress: null,
        hasTarget: false,
      }
    }

    const provider = ProviderModule.getAnyRpcProvider(network)
    let contractAddress = address

    // Check if the contract is a proxy and get its implementation address
    const implementationAddress = await ProxyContractHelper.getImplementationAddress(address, network)
    if (implementationAddress) {
      contractAddress = implementationAddress
    }

    const pluginDetails: IPluginInfo = {
      proxy: !!implementationAddress,
      implementationAddress: implementationAddress || null,
      type: IPluginInterfaceType.unknown,
      hasTarget: false,
    }

    try {
      const contractCodeAddress = contractAddress === utils.zeroAddress ? address : contractAddress
      const bytecode = await provider.getCode(contractCodeAddress)
      if (!bytecode || bytecode === '0x') return pluginDetails

      function hasFunction(signature: string): boolean {
        return bytecode.includes(PluginDetector._generateFunctionHash(signature).replace('0x', ''))
      }

      function hasFunctions(functions: string[]): boolean {
        return functions.every(hasFunction)
      }

      if (hasFunctions(PluginDetector.LOCK_TO_VOTE_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.lockToVote
      } else if (hasFunctions(PluginDetector.TOKEN_VOTING_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.tokenVoting
      } else if (hasFunctions(PluginDetector.SPP_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.spp
      } else if (hasFunctions(PluginDetector.MULTISIG_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.multisig
      } else if (hasFunctions(PluginDetector.CAPITAL_DISTRIBUTION_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.capitalDistribution
      } else if (hasFunctions(PluginDetector.ADMIN_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.admin
      } else if (hasFunctions(PluginDetector.GAUGE_VOTER_FUNCTIONS)) {
        pluginDetails.type = IPluginInterfaceType.gauge
      } else {
        pluginDetails.type = IPluginInterfaceType.unknown
      }

      if (hasFunctions(PluginDetector.HAS_TARGET)) {
        pluginDetails.hasTarget = true
      }

      return pluginDetails
    } catch (error) {
      logger.error('Error detecting plugin type', llo({ address, error }))
      return pluginDetails
    }
  },

  async detectAddressType(address: string, network: NetworksEnum): Promise<VotingBodyBrandIdentity> {
    try {
      if (address === ZeroAddress) {
        return VotingBodyBrandIdentity.EOA
      }

      const provider = ProviderModule.getAnyRpcProvider(network)
      const code = await provider.getCode(address)

      if (!code || code === '0x') {
        return VotingBodyBrandIdentity.EOA
      }

      const signature = PluginDetector._generateFunctionHash(PluginDetector.SAFE_WALLET)
      if (code.includes(signature.replace('0x', ''))) {
        return VotingBodyBrandIdentity.SAFE
      }

      return VotingBodyBrandIdentity.OTHER
    } catch (error: any) {
      return VotingBodyBrandIdentity.OTHER
    }
  },
}

export default PluginDetector
