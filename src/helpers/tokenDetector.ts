import { keccak256, ZeroAddress } from 'ethers'
import { type ITokenInfo, ITokenType, type NetworksEnum } from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:TokenDetector' })

const TokenDetector = {
  HAS_NAME: ['name()'],
  HAS_SYMBOL: ['symbol()'],
  HAS_DECIMALS: ['decimals()'],
  HAS_TOTAL_SUPPLY: ['totalSupply()'],
  HAS_BALANCE_OF_ERC20: ['balanceOf(address)'],
  HAS_BALANCE_OF_ERC777: ['balanceOf(address,uint256)'],
  HAS_UNDERLYING: ['underlying()'],
  ERC20_VOTES: ['getVotes(address)', 'getPastVotes(address,uint256)', 'getPastTotalSupply(uint256)'],
  HAS_DELEGATE: ['delegate(address)'],
  ERC20: [
    'totalSupply()',
    'balanceOf(address)',
    'transfer(address,uint256)',
    'transferFrom(address,address,uint256)',
    'approve(address,uint256)',
    'allowance(address,address)',
  ],
  ERC721: [
    'ownerOf(uint256)',
    'balanceOf(address)',
    'approve(address,uint256)',
    'getApproved(uint256)',
    'setApprovalForAll(address,bool)',
    'isApprovedForAll(address,address)',
    'safeTransferFrom(address,address,uint256)',
  ],
  ERC1155: [
    'balanceOf(address,uint256)',
    'balanceOfBatch(address[],uint256[])',
    'setApprovalForAll(address,bool)',
    'isApprovedForAll(address,address)',
    'safeTransferFrom(address,address,uint256,uint256,bytes)',
    'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
  ],
  ERC777: [
    'granularity()',
    'defaultOperators()',
    'send(address,uint256,bytes)',
    'burn(uint256,bytes)',
    'operatorSend(address,address,uint256,bytes,bytes)',
    'operatorBurn(address,uint256,bytes,bytes)',
  ],

  _generateFunctionHash(functionSignature: string): string {
    return keccak256(Buffer.from(functionSignature)).slice(0, 10)
  },

  async detectTokenType(address: string, network: NetworksEnum): Promise<ITokenInfo> {
    const contractDetails: ITokenInfo = {
      proxy: false,
      implementationAddress: null,
      type: ITokenType.unknown,
      isGovernance: false,
      hasUnderlying: false,
      hasBalanceOfERC20: false,
      hasBalanceOfERC777: false,
      hasName: false,
      hasSymbol: false,
      hasDecimals: false,
      hasTotalSupply: false,
      hasDelegate: false,
    }

    if (address === ZeroAddress) {
      contractDetails.type = ITokenType.native
      return contractDetails
    }

    const provider = ProviderModule.getAnyRpcProvider(network)
    let contractAddress = address

    // Check if the contract is a proxy and get the implementation address
    const implementationAddress = await ProxyContractHelper.getImplementationAddress(address, network)
    if (implementationAddress) {
      contractAddress = implementationAddress
    }

    contractDetails.proxy = !!implementationAddress
    contractDetails.implementationAddress = implementationAddress || null

    try {
      const contractCodeAddress = contractAddress === utils.zeroAddress ? address : contractAddress
      const bytecode = await provider.getCode(contractCodeAddress)
      if (!bytecode || bytecode === '0x') return contractDetails

      function hasFunction(signature: string): boolean {
        return bytecode.includes(TokenDetector._generateFunctionHash(signature).replace('0x', ''))
      }

      function hasFunctions(functions: string[]): boolean {
        return functions.every(hasFunction)
      }

      if (hasFunctions(TokenDetector.HAS_NAME)) contractDetails.hasName = true
      if (hasFunctions(TokenDetector.HAS_SYMBOL)) contractDetails.hasSymbol = true
      if (hasFunctions(TokenDetector.HAS_DECIMALS)) contractDetails.hasDecimals = true
      if (hasFunctions(TokenDetector.HAS_TOTAL_SUPPLY)) contractDetails.hasTotalSupply = true
      if (hasFunctions(TokenDetector.ERC20_VOTES)) contractDetails.isGovernance = true
      if (hasFunctions(TokenDetector.HAS_UNDERLYING)) contractDetails.hasUnderlying = true
      if (hasFunctions(TokenDetector.HAS_BALANCE_OF_ERC20)) contractDetails.hasBalanceOfERC20 = true
      if (hasFunctions(TokenDetector.HAS_BALANCE_OF_ERC777)) contractDetails.hasBalanceOfERC777 = true
      if (hasFunctions(TokenDetector.HAS_DELEGATE)) contractDetails.hasDelegate = true

      if (hasFunctions(TokenDetector.ERC20)) {
        contractDetails.type = ITokenType.ERC20
      } else if (hasFunctions(TokenDetector.ERC721)) {
        contractDetails.type = ITokenType.ERC721
      } else if (hasFunctions(TokenDetector.ERC1155)) {
        contractDetails.type = ITokenType.ERC1155
      } else if (hasFunctions(TokenDetector.ERC777)) {
        contractDetails.type = ITokenType.ERC777
      }

      return contractDetails
    } catch (error) {
      logger.error('Error detecting token type', llo({ address, error }))
      return contractDetails
    }
  },
}

export default TokenDetector
