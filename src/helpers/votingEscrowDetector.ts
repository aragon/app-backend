import ProxyContractHelper from '@helpers/proxyContract'
import utils from '@helpers/utils'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { type IVotingEscrowInfo, type NetworksEnum } from '@types'
import { keccak256, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:VotingEscrowDetector' })

const VotingEscrowDetector = {
  VOTING_ESCROW_FUNCTIONS: [
    'createLock(uint256)',
    'curve()',
    'lockNFT()',
    'queue()',
    'setVoter(address)',
    'totalVotingPower()',
    'totalVotingPowerAt(uint256)',
    'votingPowerAt(uint256,uint256)',
    'withdraw(uint256)',
  ],

  _generateFunctionHash(functionSignature: string): string {
    return keccak256(Buffer.from(functionSignature)).slice(0, 10)
  },

  async isVotingEscrow(address: string, network: NetworksEnum): Promise<IVotingEscrowInfo> {
    if (address === ZeroAddress) {
      return {
        proxy: false,
        implementationAddress: null,
        status: false,
      }
    }

    const provider = ProviderModule.getAnyRpcProvider(network)
    let contractAddress = address

    // Check if the contract is a proxy and get its implementation address
    const implementationAddress = await ProxyContractHelper.getImplementationAddress(address, network)
    if (implementationAddress) {
      contractAddress = implementationAddress
    }

    const contractDetails: IVotingEscrowInfo = {
      proxy: !!implementationAddress,
      implementationAddress: implementationAddress || null,
      status: false,
    }

    try {
      const contractCodeAddress = contractAddress === utils.zeroAddress ? address : contractAddress
      const bytecode = await provider.getCode(contractCodeAddress)
      if (!bytecode || bytecode === '0x') return contractDetails

      function hasFunction(signature: string): boolean {
        return bytecode.includes(VotingEscrowDetector._generateFunctionHash(signature).replace('0x', ''))
      }

      function hasFunctions(functions: string[]): boolean {
        return functions.every(hasFunction)
      }

      if (hasFunctions(VotingEscrowDetector.VOTING_ESCROW_FUNCTIONS)) {
        contractDetails.status = true
        return contractDetails
      }

      return contractDetails
    } catch (error) {
      logger.error('Error detecting voting escrow', llo({ address, error }))
      return contractDetails
    }
  },
}

export default VotingEscrowDetector
