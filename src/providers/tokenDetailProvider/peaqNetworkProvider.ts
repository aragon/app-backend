import SubscanApi from '@helpers/subscanApi'
import { EnumQueueName, type ITokenDetailsProvider, type ITokenProviderInfoArg, type NetworksEnum } from '@types'
import utils from '@helpers/utils'
import logger from '@logger'
import type Token from '@models/schema/token'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'provider:PeaqTokenProvider' })

export const PeaqNetworkTokenProvider: ITokenDetailsProvider = {
  async fetchTokenDetails(_tokenTypeInfo: ITokenProviderInfoArg, tokenAddress: string, network: NetworksEnum) {
    const tokenInfo: any =
      tokenAddress === utils.zeroAddress
        ? await SubscanApi.getNativeTokenInfo(network)
        : await SubscanApi.getTokenFullDetails(tokenAddress, network)

    if (!tokenInfo.name || tokenInfo.name === '') {
      logger.error(
        'Token name is empty for token address',
        llo({
          tokenInfo,
          tokenAddress,
          network,
        }),
      )

      await RabbitMQHelper.sendMessage(EnumQueueName.tokenInfo, {
        id: `token-metrics${tokenAddress}`,
        params: { address: tokenAddress, network },
      })
    }

    return {
      tokenDetails: tokenInfo,
      tokenMetrics: {
        totalHolders: tokenInfo.totalHolders,
        totalSupply: tokenInfo.totalSupply,
      },
    }
  },

  async fetchContractCreation(tokenAddress: string, network: NetworksEnum) {
    const contractInfo = await SubscanApi.fetchContractCreation(tokenAddress, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address: tokenAddress }
  },

  async fetchContractSourceCode(contractAddress: string, network: NetworksEnum) {
    return SubscanApi.getContractSourceCode(contractAddress, network)
  },

  async fetchBasicTokenInfo(tokenDb: Token) {
    return SubscanApi.getTokenFullDetails(tokenDb.address, tokenDb.network)
  },
}
