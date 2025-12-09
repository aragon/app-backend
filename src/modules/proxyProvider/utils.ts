import type { IWeb3TokenBalance, LogServicePattern, NetworksEnum } from '@types'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'

const ProxyUtils = {
  updateProgressInConfigIndexer: async (
    network: NetworksEnum,
    service: LogServicePattern,
    lastSync: number,
    finished?: boolean,
  ) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const existingConfig = await Models.ConfigIndexer.findExistingLog(
        {
          network,
          service,
        },
        { session },
      )

      if (existingConfig) {
        await existingConfig.update(
          {
            lastSync,
            end: finished,
          },
          { session },
        )
      } else {
        await Models.ConfigIndexer.create(
          {
            network,
            service,
            lastSync,
            end: finished,
          },
          { session },
        )
      }

      await session.commitTransaction()
      await session.endSession()
    })
  },

  getProgressFromConfigIndexer: async (network: NetworksEnum, service: LogServicePattern) => {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network,
      service,
    })
    if (existingConfig) {
      return existingConfig
    }
    return null
  },

  enrichTokenBalances: async (
    tokensBalance: IWeb3TokenBalance[],
    network: NetworksEnum,
  ): Promise<IWeb3TokenBalance[]> => {
    return (
      await Promise.all(
        tokensBalance.map(async (tokenBalance: IWeb3TokenBalance) => {
          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: tokenBalance.tokenBalance,
            originalBalance: tokenBalance.originalBalance,
            priceUsd: tokenBalance.priceUsd,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },
}

export default ProxyUtils
