import {
  EnumQueueName,
  type ITokenDetailsProvider,
  type ITokenMetrics,
  type ITokenProviderInfoArg,
  ITokenType,
  type NetworksEnum,
} from '@types'
import { RateModule } from '@modules/rates'
import BlockScoutHelper from '@helpers/blockScout'
import Web3Helper from '@helpers/web3'
import CovalentHelper from '@helpers/covalent'
import RabbitMQHelper from '@helpers/rabbitMQ'
import EtherscanHelper from '@helpers/etherscan'
import type Token from '@models/schema/token'

export const DefaultNetworkTokenProvider: ITokenDetailsProvider = {
  async fetchTokenDetails(tokenTypeInfo: ITokenProviderInfoArg, tokenAddress: string, network: NetworksEnum) {
    const tokenDetails = await RateModule.fetchRate(tokenAddress, network)
    let tokenMetrics: ITokenMetrics = { totalHolders: 0, totalSupply: '0' }

    if (tokenTypeInfo.type === ITokenType.native) {
      return { tokenDetails, tokenMetrics }
    }

    const tokenFullDetails = await BlockScoutHelper.getTokenFullDetails(tokenAddress, network)

    if (tokenFullDetails) {
      Object.assign(tokenDetails, {
        name: tokenFullDetails.name,
        symbol: tokenFullDetails.symbol,
        decimals: tokenFullDetails.decimals,
        logo: tokenFullDetails.logo,
        type: tokenFullDetails.type,
        priceUsd: tokenFullDetails.priceUsd || tokenDetails.priceUsd,
      })
      Object.assign(tokenMetrics, {
        totalHolders: tokenFullDetails.holders,
        totalSupply: tokenFullDetails.totalSupply,
      })
    } else if (tokenTypeInfo.isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)) {
      tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)
    }

    if (
      tokenTypeInfo.type === ITokenType.ERC20 &&
      (tokenDetails.decimals === null || !tokenDetails.name || !tokenDetails.symbol)
    ) {
      const onChainTokenInfo = await Web3Helper.getTokenInfo(tokenAddress, network)
      Object.assign(tokenDetails, onChainTokenInfo)
    }

    if (
      (tokenTypeInfo.isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)) &&
      tokenMetrics.totalHolders === 0 &&
      tokenMetrics.totalSupply === '0'
    ) {
      const totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
      tokenMetrics.totalSupply = totalSupply.toString()

      await RabbitMQHelper.sendMessage(EnumQueueName.tokenInfo, {
        id: `token-metrics${tokenAddress}`,
        params: { address: tokenAddress, network },
      })
    }

    return { tokenDetails, tokenMetrics }
  },

  async fetchContractCreation(tokenAddress: string, network: NetworksEnum) {
    const contractInfo = await EtherscanHelper.fetchContractCreation({
      contractAddress: tokenAddress,
      network,
    })

    if (contractInfo?.length) {
      const txHash = contractInfo[0].txHash
      const txReceipt = await Web3Helper.getTransaction(txHash, network)
      return {
        blockNumber: txReceipt?.blockNumber || 0,
        transactionHash: txHash,
        address: tokenAddress,
      }
    }

    return { blockNumber: 0, transactionHash: null, address: tokenAddress }
  },

  async fetchContractSourceCode(contractAddress: string, network: NetworksEnum) {
    let contractDetails = await BlockScoutHelper.getContractSourceCode(contractAddress, network)

    if (!contractDetails) {
      contractDetails = await EtherscanHelper.fetchContractSourceCode({
        contractAddress,
        network,
      })
    }

    return contractDetails
  },

  async fetchBasicTokenInfo(tokenDb: Token) {
    let tokenDetails = await BlockScoutHelper.getTokenFullDetails(tokenDb.address, tokenDb.network)
    if (!tokenDetails) {
      const tokenDetailsWithRate = await RateModule.fetchRate(tokenDb.address, tokenDb.network)
      if (tokenDb.isGovernance) {
        const tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenDb.address, tokenDb.network)
        tokenDetails = {
          ...Object.assign(tokenDetailsWithRate, tokenMetrics),
        }
      }
    }

    return tokenDetails
  },
}
