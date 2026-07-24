import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import config from '@config'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { GovernanceVeBatchHandler, VE_TOPICS } from '@handlers/governanceVeBatchHandler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import DaoAddressCache from '@modules/daoAddressCache'
import TokenEligibilityCache from '@modules/tokenEligibilityCache'
import { type LogServicePattern, NetworksEnum } from '@types'
import { ethers, Interface, type Log } from 'ethers'

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
      })

      PoolingCrawler.instances.set(instanceKey, poolingCrawler)
      return poolingCrawler.crawl()
    } catch (error) {
      logger.error('PoolingCrawler error', llo({ network, error }))
    }
  },

  async filterLogs(logs: Log[], network: NetworksEnum, includeTransfer = false) {
    try {
      if (includeTransfer) {
        return await PoolingCrawler._filterTransferLogs(logs, network)
      } else {
        const filtered = await PoolingCrawler._filterDelegateVotesLogs(logs, network)
        return await PoolingCrawler._filterVeLogs(filtered, network)
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

    if (transferLogs.length !== 0 || nativeTokenDepositedLogs.length !== 0) {
      await DaoAddressCache.refresh(network)
    }

    /**
     * Membership is tested on the raw lowercase hex (no per-log checksum);
     * the set holds the checksummed addresses exactly as stored in the DB.
     */
    const daoAddressesSet = new Set<string>()

    for (const log of transferLogs) {
      const receiver = PoolingCrawler._getReceiverAddressRaw(log)
      if (!receiver) continue
      const daoAddress = DaoAddressCache.getChecksummed(network, receiver)
      if (daoAddress) daoAddressesSet.add(daoAddress)
    }

    for (const log of nativeTokenDepositedLogs) {
      const daoAddress = DaoAddressCache.getChecksummed(network, log.address)
      if (daoAddress) daoAddressesSet.add(daoAddress)
    }

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
    const hasDelegateVotesChangedLogs = logs.some(
      log => log.topics.length > 0 && log.topics[0] === delegateVotesChangedTopic,
    )
    if (hasDelegateVotesChangedLogs) {
      await TokenEligibilityCache.refresh(network)
    }

    /**
     * Eligibility (installed tokenVoting plugin token ∩ syncable delegate
     * token) is answered by the incremental cache on the raw lowercase hex —
     * no per-log checksum and no per-tick distinct/$in queries.
     */
    return logs.filter(log => {
      if (log.topics[0] !== delegateVotesChangedTopic) return true
      return TokenEligibilityCache.getChecksummed(network, log.address) !== undefined
    })
  },

  async _filterVeLogs(logs: Log[], network: NetworksEnum) {
    const veLogs: Log[] = []
    const remainingLogs: Log[] = []

    for (const log of logs) {
      if (log.topics.length > 0 && VE_TOPICS.has(log.topics[0])) {
        veLogs.push(log)
      } else {
        remainingLogs.push(log)
      }
    }

    if (veLogs.length === 0) return logs

    try {
      const handled = await GovernanceVeBatchHandler.processVeEventsBatch(veLogs, network)
      if (handled === 0) {
        logger.warn(
          'VeBatch processed 0 events, falling back to individual handlers',
          llo({ network, veLogCount: veLogs.length }),
        )
        return logs
      }
    } catch (error) {
      logger.error('VeBatch processing failed, falling back to individual handlers', llo({ network, error }))
      return logs
    }

    // VE logs handled — remove them from normal flow
    return remainingLogs
  },

  _getReceiverAddress: (log: Log) => {
    try {
      if (log.topics.length === 3) {
        return ethers.getAddress(`0x${log.topics[2].slice(-40)}`)
      }
    } catch (_error) {}
    return null
  },

  _getReceiverAddressRaw: (log: Log) => {
    if (log.topics.length === 3) {
      return `0x${log.topics[2].slice(-40)}`
    }
    return null
  },
}

export default PoolingCrawler
