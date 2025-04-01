import { ethers, Interface, type Log } from 'ethers'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'

const llo = logger.logMeta.bind(null, { service: 'module:PoolingFilter' })

const govTokenInterface = new Interface(GovernanceERC20.abi)
const erc721Interface = new Interface(ERC721.abi)

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
      batchSize: 0.005,
      oneBlockPerTime: NetworksEnum.peaqMainnet === network ? true : undefined,
    })

    this.instances.set(network, poolingCrawler)
    return poolingCrawler.crawl()
  },

  async filterLogs(logs: Log[], network: NetworksEnum) {
    const topicsToFilterOut = new Map<string, 'Transfer' | 'NativeTokenDeposited' | 'DelegateVotesChanged'>([
      [new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!, 'NativeTokenDeposited'],
      [new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!, 'Transfer'],
      [new Interface(GovernanceERC20.abi).getEvent('DelegateVotesChanged')?.topicHash!, 'DelegateVotesChanged'],
    ])

    const { nativeTokenDepositedLogs, transferLogs, delegateVotesChangedLogs } = logs.reduce(
      (acc, log) => {
        if (log.topics.length === 0) return acc
        switch (topicsToFilterOut.get(log.topics[0])) {
          case 'NativeTokenDeposited':
            acc.nativeTokenDepositedLogs.push(log)
            break
          case 'Transfer':
            acc.transferLogs.push(log)
            break
          case 'DelegateVotesChanged':
            acc.delegateVotesChangedLogs.push(log)
            break
        }
        return acc
      },
      {
        nativeTokenDepositedLogs: [] as Log[],
        transferLogs: [] as Log[],
        delegateVotesChangedLogs: [] as Log[],
      },
    )

    const transferLogCache = new Map<Log, string | null>()
    const getDecodedTransferAddresses = (logs: Log[]) =>
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

    for (const daoAddress of [...daoAddressesSet]) {
      await DaoRegistryHandler.nativeTransfer(null as any, { address: daoAddress, network } as any)
    }
    // handle if we have the daoAddress set directly

    return logs.filter(log => {
      const eventType = topicsToFilterOut.get(log.topics[0])

      if (eventType === 'Transfer' && !tokenAddressesSet.has(log.address)) {
        return false
      }
      if (eventType === 'DelegateVotesChanged' && !tokenAddressesSet.has(log.address)) {
        return false
      }

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
