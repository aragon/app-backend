import { ethers, Interface, type Log } from 'ethers'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'
import { IPluginInterfaceType, IPluginStatus, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'

const llo = logger.logMeta.bind(null, { service: 'module:PoolingFilter' })

const daoInterface = new Interface(DAO.abi)
const govTokenInterface = new Interface(GovernanceERC20.abi)
const erc721Interface = new Interface(ERC721.abi)

const nativeTokenDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const PoolingCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),

  async start({ logService, network }: { logService: any; network: NetworksEnum }) {
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
  },

  async filterLogs(logs: Log[], network: NetworksEnum) {
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
        .map(log =>
          transferLogCache.has(log)
            ? transferLogCache.get(log)
            : transferLogCache.set(log, PoolingCrawler._decodeTransferLogs(log)) && transferLogCache.get(log),
        )
        .filter(Boolean) as string[]

    const tokenTransferReceiverAddresses = getDecodedTransferAddresses(transferLogs)
    const nativeTransferReceiverAddresses = nativeTokenDepositedLogs.map(log => ethers.getAddress(log.address))
    const delegateVotesChangedTokenAddresses = delegateVotesChangedLogs.map(log => ethers.getAddress(log.address))
    const transferTokenAddresses = transferLogs.map(log => ethers.getAddress(log.address))

    const [daoAddresses, tokenAddresses] = await Promise.all([
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
    ])

    const daoAddressesSet = new Set(daoAddresses)
    const tokenAddressesSet = new Set(tokenAddresses)

    await Promise.all(
      [...daoAddressesSet].map(async daoAddress =>
        DaoRegistryHandler.nativeTransfer(null as any, { address: daoAddress, network } as any),
      ),
    )

    return logs.filter(log => {
      if (!topicsToFilterOut.has(log.topics[0])) return true
      if (log.topics[0] === transferTopic && !tokenAddressesSet.has(log.address)) return false
      if (log.topics[0] === delegateVotesChangedTopic && !tokenAddressesSet.has(log.address)) return false
      return true
    })
  },

  _decodeTransferLogs: (log: Log) => {
    let decoded: any = null
    try {
      decoded = govTokenInterface.parseLog(log)
    } catch (e) {
      try {
        decoded = erc721Interface.parseLog(log)
      } catch (e) {
        // skip
      }
    }
    return decoded ? decoded.args.to : null
  },
}

export default PoolingCrawler
