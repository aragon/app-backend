import { ethers, Interface, type Log } from 'ethers'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { IPluginInterfaceType, IPluginStatus, type LogServicePattern, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
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
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),

  async start({ logService, network }: { logService: LogServicePattern; network: NetworksEnum }) {
    try {
      if (this.instances.has(network)) {
        return this.instances.get(network)!.crawl()
      }

      const poolingCrawler = new BlockchainLogCrawler({
        network,
        events: configIndexer,
        filterLogs: async (logs: any) => PoolingCrawler.filterLogs(logs, network),
        onError: async (error: any) => logger.error('Error Indexer', llo({ network, error })),
        logService,
        stopOnError: true,
        batchSize: 0.01,
      })

      this.instances.set(network, poolingCrawler)
      return poolingCrawler.crawl()
    } catch (error) {
      logger.error('PoolingCrawler start', llo({ network, error }))
    }
  },

  _getUniqueArrayItems: (array: any[]) => {
    const uniqueArray = new Set(array)
    return Array.from(uniqueArray)
  },

  async filterLogs(logs: Log[], network: NetworksEnum) {
    try {
      const topicsToFilterOut = new Set([nativeTokenDepositedTopic, transferTopic, delegateVotesChangedTopic])

      let i = logs.length
      const nativeTokenDepositedLogs: Log[] = []
      const transferLogs: Log[] = []
      const delegateVotesChangedLogs: Log[] = []

      while (i--) {
        const log = logs[i]
        if (log.topics.length === 0 || !topicsToFilterOut.has(log.topics[0])) continue

        if (log.topics[0] === nativeTokenDepositedTopic) {
          nativeTokenDepositedLogs.push(log)
        } else if (log.topics[0] === transferTopic) {
          transferLogs.push(log)
        } else {
          delegateVotesChangedLogs.push(log)
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

      const delegateVotesChangedTokenAddresses = PoolingCrawler._getUniqueArrayItems(
        delegateVotesChangedLogs.map(log => ethers.getAddress(log.address)),
      )

      const transferTokenAddresses = PoolingCrawler._getUniqueArrayItems(
        transferLogs.map(log => ethers.getAddress(log.address)),
      )

      const [daoAddresses, pluginTokenAddresses, validTokenAddresses] = await Promise.all([
        Models.Dao.distinct('address', {
          address: { $in: [...tokenTransferReceiverAddresses, ...nativeTransferReceiverAddresses] },
          network,
        }),
        Models.Plugin.distinct('tokenAddress', {
          tokenAddress: { $in: [...new Set([...delegateVotesChangedTokenAddresses, ...transferTokenAddresses])] },
          status: IPluginStatus.installed,
          isSupported: true,
          interfaceType: IPluginInterfaceType.tokenVoting,
          network,
        }),
        Models.Token.distinct('address', {
          address: { $in: [...new Set([...delegateVotesChangedTokenAddresses, ...transferTokenAddresses])] },
          ignoreTransfer: { $ne: true },
          network,
        }),
      ])

      const tokenAddresses = pluginTokenAddresses.filter(addr => validTokenAddresses.includes(addr))
      const daoAddressesSet = new Set(daoAddresses)
      const tokenAddressesSet = new Set(tokenAddresses)

      process.nextTick(async () => {
        if (network === NetworksEnum.peaqMainnet) await utils.wait(config.NODES.PEAQ_MAINNET.INTERVAL_BLOCK_TIME * 1000)
        await Promise.all(
          [...daoAddressesSet].map(async daoAddress =>
            DaoRegistryHandler.nativeTransfer(null as any, { address: daoAddress, network } as any),
          ),
        )
      })

      return logs.filter(log => {
        if (!topicsToFilterOut.has(log.topics[0])) return true
        // NOTE: we don't pass Transfer logs
        // if (log.topics[0] === transferTopic && !tokenAddressesSet.has(ethers.getAddress(log.address))) return false
        return !(log.topics[0] === delegateVotesChangedTopic && !tokenAddressesSet.has(ethers.getAddress(log.address)))
      })
    } catch (error) {
      logger.error('PoolingCrawler filterLogs', llo({ network, error }))
      return logs
    }
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
