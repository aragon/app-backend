import { ethers, Interface, type Log } from 'ethers'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { IPluginInterfaceType, IPluginStatus, type LogServicePattern, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'module:PoolingFilter' })

const daoInterface = new Interface(DAO.abi)
const govTokenInterface = new Interface(GovernanceERC20.abi)

const nativeTokenDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const PoolingCrawler = {
  instances: new Map<string, BlockchainLogCrawler>(),

  async start({
    logService,
    network,
    includeTransfer = false,
  }: {
    logService: LogServicePattern
    network: NetworksEnum
    includeTransfer?: boolean
  }) {
    try {
      const instanceKey = `${network}-${includeTransfer ? 'transfer' : 'main'}`
      if (PoolingCrawler.instances.has(instanceKey as NetworksEnum)) {
        return PoolingCrawler.instances.get(instanceKey as NetworksEnum)!.crawl()
      }

      const poolingCrawler = new BlockchainLogCrawler({
        network,
        events: includeTransfer
          ? [
              {
                event: 'Transfer',
                enableHistorical: false,
                topic: new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
                config: [],
              },
              {
                event: 'NativeTokenDeposited',
                enableHistorical: false,
                topic: new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
                config: [],
              },
            ]
          : configIndexer,
        filterLogs: async (logs: any) => PoolingCrawler.filterLogs(logs, network, includeTransfer),
        onError: async (error: any) => logger.error('Error Indexer', llo({ network, error })),
        logService,
        stopOnError: true,
        batchSize: 0.05,
        skipLogProcessing: includeTransfer,
      })

      PoolingCrawler.instances.set(instanceKey, poolingCrawler)
      return poolingCrawler.crawl()
    } catch (error) {
      logger.error('PoolingCrawler error', llo({ network, error }))
    }
  },

  _getUniqueArrayItems: (array: any[]) => {
    const uniqueArray = new Set(array)
    return Array.from(uniqueArray)
  },

  async filterLogs(logs: Log[], network: NetworksEnum, includeTransfer = false) {
    try {
      if (includeTransfer) {
        return await PoolingCrawler._filterTransferLogs(logs, network)
      } else {
        return await PoolingCrawler._filterDelegateVotesLogs(logs, network)
      }
    } catch (error) {
      logger.error('PoolingCrawler filterLogs', llo({ network, error }))
      return logs
    }
  },

  async _filterTransferLogs(logs: Log[], network: NetworksEnum) {
    const topicsToHandle = new Set([nativeTokenDepositedTopic, transferTopic])

    let i = logs.length
    const nativeTokenDepositedLogs: Log[] = []
    const transferLogs: Log[] = []

    while (i--) {
      const log = logs[i]
      if (log.topics.length === 0 || !topicsToHandle.has(log.topics[0])) continue

      if (log.topics[0] === nativeTokenDepositedTopic) {
        nativeTokenDepositedLogs.push(log)
      } else if (log.topics[0] === transferTopic) {
        transferLogs.push(log)
      }
    }

    const transferLogCache = new Map<Log, string | null>()

    const getDecodedTransferAddresses = (logs: Log[]): string[] =>
      logs
        .map(log => {
          if (transferLogCache.has(log)) return transferLogCache.get(log)
          const address = PoolingCrawler._getReceiverAddress(log)
          if (!address) return false
          transferLogCache.set(log, address)
          return transferLogCache.get(log)
        })
        .filter(Boolean) as string[]

    const tokenTransferReceiverAddresses = PoolingCrawler._getUniqueArrayItems(
      getDecodedTransferAddresses(transferLogs),
    )

    const nativeTransferReceiverAddresses = PoolingCrawler._getUniqueArrayItems(
      nativeTokenDepositedLogs.map(log => ethers.getAddress(log.address)),
    )

    const daoAddresses = await Models.Dao.distinct('address', {
      address: { $in: [...tokenTransferReceiverAddresses, ...nativeTransferReceiverAddresses] },
      network,
    })

    const daoAddressesSet = new Set(daoAddresses)

    if (daoAddressesSet.size !== 0) {
      process.nextTick(async () => {
        if (network === NetworksEnum.peaqMainnet) await utils.wait(config.NODES.PEAQ_MAINNET.INTERVAL_BLOCK_TIME * 1000)
        await Promise.all(
          [...daoAddressesSet].map(async daoAddress =>
            DaoRegistryHandler.nativeTransfer(null as any, { address: daoAddress, network } as any),
          ),
        )
      })
    }

    return logs.filter(log => !topicsToHandle.has(log.topics[0]))
  },

  async _filterDelegateVotesLogs(logs: Log[], network: NetworksEnum) {
    const delegateVotesChangedLogs: Log[] = []

    let i = logs.length
    while (i--) {
      const log = logs[i]
      if (log.topics.length === 0) continue

      if (log.topics[0] === delegateVotesChangedTopic) {
        delegateVotesChangedLogs.push(log)
      }
    }

    const delegateVotesChangedTokenAddresses = PoolingCrawler._getUniqueArrayItems(
      delegateVotesChangedLogs.map(log => ethers.getAddress(log.address)),
    )

    // Query to find valid token addresses for DelegateVotesChanged
    const [pluginTokenAddresses, validTokenAddresses] = await Promise.all([
      Models.Plugin.distinct('tokenAddress', {
        tokenAddress: { $in: delegateVotesChangedTokenAddresses },
        status: IPluginStatus.installed,
        isSupported: true,
        interfaceType: IPluginInterfaceType.tokenVoting,
        network,
      }),
      Models.Token.distinct('address', {
        address: { $in: delegateVotesChangedTokenAddresses },
        ignoreTransfer: { $ne: true },
        hasDelegate: true, // only tokens that have delegate votes need to be synced
        network,
      }),
    ])

    const tokenAddresses = pluginTokenAddresses.filter(addr => validTokenAddresses.includes(addr))
    const tokenAddressesSet = new Set(tokenAddresses)

    return logs.filter(log => {
      if (log.topics[0] !== delegateVotesChangedTopic) return true
      return log.topics[0] === delegateVotesChangedTopic && tokenAddressesSet.has(ethers.getAddress(log.address))
    })
  },

  _getReceiverAddress: (log: Log) => {
    try {
      if (log.topics.length === 3) {
        return ethers.getAddress(`0x${log.topics[2].slice(-40)}`)
      }
    } catch (error) {}
    return null
  },
}

export default PoolingCrawler
