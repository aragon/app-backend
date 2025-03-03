import { EnumQueueName, type ITokenMetrics, ITokenType, type NetworksEnum } from '@types'
import { RateModule } from '@modules/rates'
import BlockScoutHelper from '@helpers/blockScout'
import Web3Helper from '@helpers/web3'
import CovalentHelper from '@helpers/covalent'
import RabbitMQHelper from '@helpers/rabbitMQ'

export const DefaultNetworkTokenProvider = {
  async fetchTokenDetails(
    tokenTypeInfo: { type: ITokenType; isGovernance: boolean },
    tokenAddress: string,
    network: NetworksEnum,
  ) {
    const tokenRate = await RateModule.fetchRate(tokenAddress, network)
    let tokenMetrics: ITokenMetrics = { totalHolders: 0, totalSupply: '0' }

    if (tokenTypeInfo.type === ITokenType.native) {
      return { tokenRate, tokenMetrics }
    }

    const tokenFullDetails = await BlockScoutHelper.getTokenFullDetails(tokenAddress, network)

    if (tokenFullDetails) {
      Object.assign(tokenRate, {
        name: tokenFullDetails.name,
        symbol: tokenFullDetails.symbol,
        decimals: tokenFullDetails.decimals,
        logo: tokenFullDetails.logo,
        type: tokenFullDetails.type,
        priceUsd: tokenFullDetails.priceUsd || tokenRate.priceUsd,
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
      (tokenRate.decimals === null || !tokenRate.name || !tokenRate.symbol)
    ) {
      const onChainTokenInfo = await Web3Helper.getTokenInfo(tokenAddress, network)
      Object.assign(tokenRate, onChainTokenInfo)
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

    return { tokenRate, tokenMetrics }
  },
}
