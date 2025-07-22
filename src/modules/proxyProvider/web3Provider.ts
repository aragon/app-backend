import logger from '@logger'
import {
  type IAlchemyTransferResponse,
  IEnumIndexerService,
  ITransactionType,
  type IWeb3Provider,
  type IWeb3TokenBalance,
  type NetworksEnum,
} from '@types'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import Alchemy from '@helpers/alchemy'
import Web3Utils from '@helpers/web3Utils'
import BlockScoutHelper from '@helpers/blockScout'
import Web3Helper from '@helpers/web3'
import CovalentHelper from '@helpers/covalent'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { RateModule } from '@modules/rates'
import TokenUtils from '@helpers/tokenUtils'
import ProxyUtils from '@modules/proxyProvider/utils'
import AnkrHelper from '@helpers/ankrHelper'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const Web3Provider: IWeb3Provider = {
  getNativeBalance: async ({ address, network }) => {
    const balance = await Web3Helper.getNativeBalance(address, network)
    if (!Number(balance)) {
      return '0'
    }

    const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)

    if (!token) {
      logger.error('token not found balance 0', llo())
      return '0'
    }

    const parsedBalance = Alchemy.handleAlchemyCrazyBalance(balance, token?.decimals)
    Alchemy.alchemyCrazyBalanceOnError(address, token?.address, network, balance, token?.decimals)
    return parsedBalance
  },

  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await Web3Helper.getTokenBalances(address, network)

    return (
      await Promise.all(
        tokensBalance.map(async (tokenBalance: IWeb3TokenBalance) => {
          if (tokenBalance.tokenBalance === utils.emptyData) return null

          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: Alchemy.handleAlchemyCrazyBalance(tokenBalance.tokenBalance, token?.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },

  fetchContractCreation: async ({ address, network }) => {
    const explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.BLOCKSCOUT, EvmExplorerEnum.ROUTESCAN]

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
    const explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.BLOCKSCOUT, EvmExplorerEnum.ROUTESCAN]

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

  fetchBasicTokenInfo: async ({ address, network }) => {
    if (address === utils.zeroAddress) {
      return await CovalentHelper.getToken(address, network)
    }
    const tokenDetails = await BlockScoutHelper.getTokenFullDetails(address, network)
    if (!tokenDetails) {
      return await CovalentHelper.getToken(address, network)
    }
    return tokenDetails
  },

  fetchTokenHolderAndSupply: async ({ address, network }) => {
    const covalentHolders = await CovalentHelper.getTokenSupplyAndHolders(address, network)
    if (covalentHolders) {
      return covalentHolders
    }

    const blockScoutHolders = await BlockScoutHelper.getTokenFullDetails(address, network)
    if (blockScoutHolders) {
      return {
        totalHolders: blockScoutHolders.totalHolders,
        totalSupply: blockScoutHolders.totalSupply,
      }
    }

    return {
      totalHolders: 0,
      totalSupply: '0',
    }
  },

  fetchAddressTxns: async ({ address, network, blockNumber }) => {
    const category = TokenUtils.getCategories()
    const txLogs: any[] = []
    const depositTxCrawler = new BlockchainTransferCrawler({
      network,
      filter: {
        toAddress: address,
        fromBlock: blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        const timestamp = await Web3Helper.getBlockTimestamp(txLog.blockNum, network)
        txLogs.push({
          ...txLog,
          type: ITransactionType.deposit,
          blockTimestamp: timestamp,
          address,
          network,
        })
      },
      onError: async (error: any) => {
        logger.error('Error deposit transfer', llo({ error, type: ITransactionType.deposit, dao: address, network }))
      },
      logService: `deposit-${address}-${IEnumIndexerService.depositTxs}` as any,
      stopOnError: true,
    })

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network,
      filter: {
        fromAddress: address,
        fromBlock: blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        const timestamp = await Web3Helper.getBlockTimestamp(txLog.blockNum, network)
        txLogs.push({
          ...txLog,
          type: ITransactionType.withdraw,
          blockTimestamp: timestamp,
          address,
          network,
        })
      },
      onError: async (error: any) => {
        logger.error('Error withdraw transfer', llo({ error, type: ITransactionType.withdraw, address, network }))
      },
      logService: `withdraw-${address}-${IEnumIndexerService.withdrawTxs}` as any,
      stopOnError: true,
    })

    await Promise.all([depositTxCrawler.crawl(), withdrawTxCrawler.crawl()])

    return txLogs.sort((a, b) => {
      const aBlockNum = Number(a.blockNum)
      const bBlockNum = Number(b.blockNum)
      if (aBlockNum !== bBlockNum) return aBlockNum - bBlockNum
      return aBlockNum - bBlockNum
    })
  },

  fetchTokenPrice: async ({ network, address, pastDays }: any): Promise<any> => {
    return await RateModule.fetchRate(address, network, pastDays)
  },

  searchDetailsOfContract: async ({ address, network }) => {
    return await BlockScoutHelper.searchDetails(address, network)
  },

  getAllTokenHolders: async ({
    address,
    network,
    callback,
    syncKey,
  }: {
    address: string
    network: NetworksEnum
    callback: ({ address, value }: { address: string; value: string }) => Promise<void> | void
    syncKey?: string
  }) => {
    const syncProgress = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey)

    if (syncProgress?.end) {
      logger.verbose('Token holder sync already completed', llo({ address, network, syncKey }))
      return
    }

    const initialPage = syncProgress ? syncProgress.lastSync + 1 : 0

    try {
      return await BlockScoutHelper.getAllTokenHolders(
        address,
        network,
        { pageSize: 1000, delayMs: 500, startPage: initialPage },
        async (holders, pageInfo) => {
          await Promise.all(holders.map(async holder => await callback(holder)))

          if (syncKey) {
            logger.verbose(
              'Update progress in config indexer',
              llo({
                page: pageInfo.currentPage,
                address,
                network,
                syncKey,
              }),
            )
            await ProxyUtils.updateProgressInConfigIndexer(
              network,
              syncKey,
              pageInfo.currentPage,
              pageInfo.isLastPage || false,
            )
          }
        },
      )
    } catch (error) {
      logger.error('Error in getAllTokenHolders', llo({ error, address, network }))
    }
  },

  fetchHistoricalTokenPrice: async ({ symbol, address, network, date }) => {
    return await RateModule.fetchHistoricalRate({
      address,
      network,
      symbol,
      timestamp: date,
    })
  },

  getTokenCounters: async ({ address, network }) => {
    const ankrStats = await AnkrHelper.getTokenHoldersCount(address, network)
    if (ankrStats) {
      return ankrStats
    }

    const blockScoutStats = await BlockScoutHelper.getTokenCounters(address, network)
    const blockScoutAvailable = !(blockScoutStats?.holders === 0 && blockScoutStats.transfers === 0)
    if (blockScoutAvailable) {
      return blockScoutStats
    }

    const covalentStats = await CovalentHelper.getTokenSupplyAndHolders(address, network)
    const covalentAvailable = !(covalentStats && covalentStats.totalHolders === 0)

    if (covalentAvailable) {
      return {
        holders: covalentStats.totalHolders,
        transfers: 0,
      }
    }

    return { holders: 0, transfers: 0 }
  },
}

export default Web3Provider
