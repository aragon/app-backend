import SubscanApi from '@helpers/subscanApi'
import { ITokenType, type IWeb3Provider } from '@types'
import { ethers } from 'ethers'

const PeaqProvider: Omit<IWeb3Provider, 'getNativeBalance'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokens = await SubscanApi.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },

  async fetchContractCreation({ address, network }) {
    const contractInfo = await SubscanApi.fetchContractCreation(address, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address }
  },

  async fetchContractSourceCode({ address, network }) {
    return SubscanApi.getContractSourceCode(address, network)
  },

  searchDetailsOfContract: async ({ address, network }) => {
    const sourceCode = await SubscanApi.getContractSourceCode(address, network)
    if (Array.isArray(sourceCode) && sourceCode.length === 1) {
      return {
        name: sourceCode[0]?.ContractName || null,
      }
    }
    const fallbackDetails = await SubscanApi.getTokenFullDetails(address, network)
    if (fallbackDetails) {
      return {
        name: fallbackDetails.name || '',
        type: 'token',
      }
    }

    return {
      name: null,
      type: ITokenType.unknown,
    }
  },
}

export default PeaqProvider
