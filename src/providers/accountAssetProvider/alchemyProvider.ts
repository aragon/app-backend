import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type IAccountBalancesProvider,
  type IAlchemyTokenBalance,
  IConnectionType,
  IProviderType,
  ITokenType,
  type NetworksEnum,
} from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import { ethers } from 'ethers'
import TokenDetector from '@helpers/tokenDetector'
import { Models } from '@dbModels'
import logger from '@logger'
const llo = logger.logMeta.bind(null, { service: 'provider:AlchemyProvider' })

export const AlchemyProvider: IAccountBalancesProvider = {
  getAccountBalances: async (address: HexAddress, network: NetworksEnum) => {
    try {
      const provider = ProviderModule.getProvider(network, IProviderType.ALCHEMY, IConnectionType.RPC)

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('alchemy_getTokenBalances', [address]),
        ),
      )

      const balances = await Promise.all(
        response?.tokenBalances
          ?.filter((token: any) => token.tokenBalance !== ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [0]))
          ?.map(async (alchemyBalance: any) => {
            const tokenDb = await Models.Token.findByTokenAddressAndNetwork(alchemyBalance.contractAddress, network)

            if (!tokenDb) {
              const tokenType = await TokenDetector.detectTokenType(alchemyBalance.contractAddress, network)

              if (
                tokenType.type === ITokenType.ERC20 &&
                !(tokenType.hasName && tokenType.hasSymbol && tokenType.hasDecimals)
              ) {
                return {
                  contractAddress: alchemyBalance.contractAddress,
                  tokenBalance: '0',
                }
              }
            }

            const token = await ProxyToken.saveAndGetToken(alchemyBalance.contractAddress, network)

            Web3Helper.alchemyCrazyBalanceOnError(
              alchemyBalance.contractAddress,
              token?.address!,
              network,
              alchemyBalance.tokenBalance,
              token?.decimals!,
            )
            const result: IAlchemyTokenBalance = {
              contractAddress:
                Web3Helper.parseAddress(alchemyBalance.contractAddress) || alchemyBalance.contractAddress,
              tokenBalance: Web3Helper.handleAlchemyCrazyBalance(alchemyBalance.tokenBalance, token?.decimals),
              originalBalance: alchemyBalance.tokenBalance,
            }
            return result
          }),
      )

      return balances.filter((token: any) => token.tokenBalance !== '0')
    } catch (error) {
      logger.warn('Error in AlchemyProvider.getAccountBalances', llo({ address, network, error }))
      return []
    }
  },
}
