import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSettingHandler } from '@services/aragon-indexer/handlers/pluginSettingHandler'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPluginSetting' })

export const LogPluginSetting = {
  eventTokenVoting: ['VotingSettingsUpdated'],
  eventMultisig: ['MultisigSettingsUpdated'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogPluginSetting', llo({ networkName }))

        const eventTokenVotingTopics = TokenVoting.abi
          .filter((item: any) => item.type && LogPluginSetting.eventTokenVoting.includes(item.name))
          .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

        const eventMultisigTopics = Multisig.abi
          .filter((item: any) => item.type && LogPluginSetting.eventMultisig.includes(item.name))
          .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: [...eventTokenVotingTopics, ...eventMultisigTopics],
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogPluginSetting.processLog(txLog, networkName),
          onError: async (error: any) => LogPluginSetting.processError(error, networkName),
          logService: IEnumIndexerService.pluginSettingLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogPluginSetting', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
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

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = LogPluginSetting.getInterface(txLog.topics[0])
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'VotingSettingsUpdated':
        logger.verbose('VotingSettingsUpdated', llo(info))
        await PluginSettingHandler.votingSettingsUpdated(event, info)
        break
      case 'MultisigSettingsUpdated':
        logger.verbose('MultisigSettingsUpdated', llo(info))
        await PluginSettingHandler.multisigSettingsUpdated(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
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
