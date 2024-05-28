import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSettingHandler } from '@services/indexer/handlers/pluginSettingHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'
import { ConfigState } from '@state/configState'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPluginSetting' })

export const LogPluginSetting = {
  eventTokenVoting: ['VotingSettingsUpdated'],
  eventMultisig: ['MultisigSettingsUpdated'],

  start: async () => {
    const networks = Object.values(Network.NETWORKS)

    await Promise.all(
      networks.map(async networkName => {
        logger.verbose('Start LogPluginSetting', llo({ networkName }))

        const networkDb = await Models.Network.findByName(networkName as NetworksEnum)
        const provider = ConfigState.getInstance().getConfigItem(networkName as NetworksEnum)

        if (!networkDb || !provider) {
          logger.warn('Unsupported Network', llo({ networkName }))
          return
        }

        const eventTokenVotingTopics = TokenVoting.abi
          .filter((item: any) => item.type && LogPluginSetting.eventTokenVoting.includes(item.name))
          .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

        const eventMultisigTopics = Multisig.abi
          .filter((item: any) => item.type && LogPluginSetting.eventMultisig.includes(item.name))
          .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: [...eventTokenVotingTopics, ...eventMultisigTopics],
          fromBlock: networkDb.lastBlockPluginSetting,
          toBlock: 'latest',
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName as NetworksEnum,
          filter,
          onLog: async (txLog: Log) => LogPluginSetting.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogPluginSetting.processError(error, networkName as NetworksEnum),
          stopOnError: true,
        })

        await crawler.crawl()
        await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginSetting')
        logger.verbose(
          'End LogPluginSetting',
          llo({ networkName, latestBlockSync: crawler.crawlResult.latestBlockNumber }),
        )
      }),
    )
  },

  getInterface: (topic: string) => {
    const eventsOfTokenVoting = [ethers.id('VotingSettingsUpdated(uint8,uint32,uint32,uint64,uint256)')]
    if (eventsOfTokenVoting.includes(topic)) {
      return new Interface(TokenVoting.abi)
    }

    return new Interface(Multisig.abi)
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const iFace = LogPluginSetting.getInterface(txLog.topics[0])

    let event = null as any
    try {
      event = iFace.parseLog(txLog)!
    } catch (error: any) {
      if (error?.message.includes('out-of-bounds')) {
        return
      }
    }

    switch (event.name) {
      case 'VotingSettingsUpdated':
        logger.verbose('VotingSettingsUpdated', llo({ eventName: event.name, network }))
        await PluginSettingHandler.votingSettingsUpdated(event, txLog, network)
        break
      case 'MultisigSettingsUpdated':
        logger.verbose('MultisigSettingsUpdated', llo({ eventName: event.name, network }))
        await PluginSettingHandler.multisigSettingsUpdated(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event, network }))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogPluginSetting',
      llo({
        error,
        network,
      }),
    )
  },
}
