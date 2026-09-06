import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import logger from '@logger'
import { IContractAddressType, type IWeb3Provider, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const EXPLORER_OVERRIDES: Partial<Record<NetworksEnum, EvmExplorerEnum[]>> = {
  [NetworksEnum.citreaMainnet]: [EvmExplorerEnum.BLOCKSCOUT],
  [NetworksEnum.hemiMainnet]: [EvmExplorerEnum.BLOCKSCOUT],
  [NetworksEnum.robinhoodMainnet]: [EvmExplorerEnum.BLOCKSCOUT_PRO, EvmExplorerEnum.BLOCKSCOUT],
}

const Web3Provider: IWeb3Provider = {
  fetchContractCreation: async ({ address, network }) => {
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (EXPLORER_OVERRIDES[network]) {
      explorers = EXPLORER_OVERRIDES[network]
    }

    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractCreation(explorerType, address, network)
      },
      {
        validate: (result: any) => !!result?.transactionHash,
        onError: (error: any, explorerType: any, index: any) => {
          logger.warn(
            `Failed to fetch contract creation from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result || { blockNumber: 0, transactionHash: null, address }
  },

  fetchContractSourceCode: async ({ address, network }) => {
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (EXPLORER_OVERRIDES[network]) {
      explorers = EXPLORER_OVERRIDES[network]
    }
    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractSourceCode(explorerType, address, network)
      },
      {
        validate: (result: any) => !!result,
        onError: (error: any, explorerType: any, index: any) => {
          logger.warn(
            `Failed to fetch contract source code from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result || null
  },

  searchDetailsOfContract: async ({ address, network }) => {
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (EXPLORER_OVERRIDES[network]) {
      explorers = EXPLORER_OVERRIDES[network]
    }

    const contractInfo = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractSourceCode(explorerType, address, network)
      },
      {
        validate: (result: any) => !!result,
        onError: (error: any, explorerType: any, index: any) => {
          logger.warn(
            `Failed to fetch contract source code from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    if (!contractInfo || contractInfo.length === 0) {
      return {
        type: IContractAddressType.ADDRESS,
        name: null,
      }
    }

    return {
      type: IContractAddressType.ADDRESS,
      name: contractInfo[0].ContractName,
    }
  },
}

export default Web3Provider
