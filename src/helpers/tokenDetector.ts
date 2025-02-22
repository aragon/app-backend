import { keccak256, ZeroAddress } from 'ethers'
import { type ITokenInfo, ITokenType, type NetworksEnum } from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'

export const ERC20_FUNCTIONS = [
  'totalSupply()',
  'balanceOf(address)',
  'transfer(address,uint256)',
  'transferFrom(address,address,uint256)',
  'approve(address,uint256)',
  'allowance(address,address)',
]

export const ERC721_FUNCTIONS = [
  'ownerOf(uint256)',
  'balanceOf(address)',
  'approve(address,uint256)',
  'getApproved(uint256)',
  'setApprovalForAll(address,bool)',
  'isApprovedForAll(address,address)',
  'safeTransferFrom(address,address,uint256)',
]

export const ERC1155_FUNCTIONS = [
  'balanceOf(address,uint256)',
  'balanceOfBatch(address[],uint256[])',
  'setApprovalForAll(address,bool)',
  'isApprovedForAll(address,address)',
  'safeTransferFrom(address,address,uint256,uint256,bytes)',
  'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
]

export const ERC777_FUNCTIONS = [
  'granularity()',
  'defaultOperators()',
  'send(address,uint256,bytes)',
  'burn(uint256,bytes)',
  'operatorSend(address,address,uint256,bytes,bytes)',
  'operatorBurn(address,uint256,bytes,bytes)',
]

export const ERC20_VOTES_FUNCTIONS = ['getVotes(address)', 'getPastVotes(address,uint256)']

export const HAS_DELEGATE = ['delegate(address)']

export const HAS_UNDERLYING = ['underlying()']

const allFunctions = [
  ...ERC20_FUNCTIONS,
  ...ERC721_FUNCTIONS,
  ...ERC1155_FUNCTIONS,
  ...ERC777_FUNCTIONS,
  ...ERC20_VOTES_FUNCTIONS,
  ...HAS_DELEGATE,
  ...HAS_UNDERLYING,
]

const functionHashes = allFunctions.reduce<Record<string, string>>((acc, func) => {
  acc[func] = keccak256(Buffer.from(func)).slice(0, 10)
  return acc
}, {})

async function detectTokenType(address: string, network: NetworksEnum): Promise<ITokenInfo> {
  if (address === ZeroAddress) {
    return {
      type: ITokenType.native,
      proxy: false,
      implementationAddress: null,
      isGovernance: false,
      isUnderlying: false,
      hasDelegate: false,
    }
  }

  const provider = ProviderModule.getAnyRpcProvider(network)
  let contractAddress = address

  // Check if the contract is a proxy and get the implementation address
  const implementationAddress = await ProxyContractHelper.getImplementationAddress(address, network)
  if (implementationAddress) {
    contractAddress = implementationAddress
  }

  const contractDetails = {
    proxy: !!implementationAddress,
    implementationAddress: implementationAddress || null,
    type: ITokenType.unknown,
    isGovernance: false,
    hasDelegate: false,
    isUnderlying: false,
  }

  try {
    const contractCodeAddress = contractAddress === utils.zeroAddress ? address : contractAddress
    const bytecode = await provider.getCode(contractCodeAddress)
    if (!bytecode || bytecode === '0x') return contractDetails

    function hasFunction(signature: string): boolean {
      return bytecode.includes(functionHashes[signature]?.replace('0x', ''))
    }

    function hasFunctions(functions: string[]): boolean {
      return functions.every(func => hasFunction(func))
    }

    if (hasFunctions(HAS_DELEGATE)) {
      contractDetails.hasDelegate = true
    }

    if (hasFunctions(ERC20_VOTES_FUNCTIONS)) {
      contractDetails.isGovernance = true
    }

    if (hasFunctions(HAS_UNDERLYING)) {
      contractDetails.isUnderlying = true
    }

    if (hasFunctions(ERC20_FUNCTIONS)) {
      contractDetails.type = ITokenType.ERC20
    } else if (hasFunctions(ERC721_FUNCTIONS)) {
      contractDetails.type = ITokenType.ERC721
    } else if (hasFunctions(ERC1155_FUNCTIONS)) {
      contractDetails.type = ITokenType.ERC1155
    } else if (hasFunctions(ERC777_FUNCTIONS)) {
      contractDetails.type = ITokenType.ERC777
    } else {
      contractDetails.type = ITokenType.unknown
    }

    return contractDetails
  } catch (error) {
    return contractDetails
  }
}

export default {
  detectTokenType,
  functionHashes,
}
