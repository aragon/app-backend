import logger from '@logger'
import { type IWeb3Provider } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import Alchemy from '@helpers/alchemy'
import Web3Utils from '@helpers/web3Utils'
import BlockScoutHelper from '@helpers/blockScout'
import Web3Helper from '@helpers/web3'
import EtherscanHelper from '@helpers/etherscan'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const Web3Provider: IWeb3Provider = {
  getNativeBalance: async ({ address, network }) => {
    const balance = await Web3Helper.getNativeBalance(address, network)
    if (!balance) {
      return '0'
    }

    const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)

    if (!token) {
      logger.error('token not found balance 0', llo())
      return '0'
    }

    const parsedBalance = Alchemy.handleAlchemyCrazyBalance(balance, token?.decimals)
    Alchemy.alchemyCrazyBalanceOnError(address, token?.address, network, parsedBalance, token?.decimals)
    return parsedBalance
  },

  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await Web3Helper.getTokenBalances(address, network)

    return await Promise.all(
      tokensBalance
        .filter((token: any) => token.tokenBalance !== utils.emptyData)
        .map(async (tokenBalance: any) => {
          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)

          Alchemy.alchemyCrazyBalanceOnError(
            tokenBalance.contractAddress,
            token?.address!,
            network,
            tokenBalance.tokenBalance,
            token?.decimals!,
          )

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: Alchemy.handleAlchemyCrazyBalance(tokenBalance.tokenBalance, token?.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
    )
  },

  fetchContractCreation: async ({ address, network }) => {
    const contractInfo = await EtherscanHelper.fetchContractCreation({
      contractAddress: address,
      network,
    })

    if (contractInfo?.length) {
      const txHash = contractInfo[0].txHash
      const txReceipt = await Web3Helper.getTransaction(txHash, network)
      return {
        blockNumber: txReceipt?.blockNumber || 0,
        transactionHash: txHash,
        address,
      }
    }

    return { blockNumber: 0, transactionHash: null, address }
  },

  fetchContractSourceCode: async ({ address, network }) => {
    let contractDetails = await BlockScoutHelper.getContractSourceCode(address, network)

    if (!contractDetails) {
      contractDetails = await EtherscanHelper.fetchContractSourceCode({
        contractAddress: address,
        network,
      })
    }

    return contractDetails
  },

  fetchBasicTokenInfo: async ({ address, network }) => {
    const tokenDetails = await BlockScoutHelper.getTokenFullDetails(address, network)
    return tokenDetails
  },
}

export default Web3Provider
