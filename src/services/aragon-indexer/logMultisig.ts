import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Web3Helper from '@helpers/web3'
import { MultisigHandler } from '@indexer/handlers/multisigHandler'
import type Plugin from '@models/schema/plugin'
import { Multisig } from '@artifacts/Multisig'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMultisig' })

export const LogMultisig = {
  events: [
    'MultisigSettingsUpdated',
    'ProposalCreated',
    'ProposalExecuted',
    'MembersAdded',
    'MembersRemoved',
    'Approved',
  ],

  start: async (plugin: Plugin) => {
    logger.verbose('Start LogMultisig', llo({ network: plugin.network }))

    const multiSigTopics = Multisig.abi
      .filter((item: any) => item.type && LogMultisig.events.includes(item.name))
      .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

    const filter = {
      address: plugin.address,
      fromBlock: plugin?.blockNumber || 0,
      topics: [...multiSigTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      filter,
      onLog: async (txLog: Log) => LogMultisig.processLog(txLog, plugin.network),
      onError: async (error: any) => LogMultisig.processError(error, plugin.network),
      logService: `Multisig-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose('End LogMultisig', llo({ network: plugin.network, latestBlockSync: crawler.crawlResult.lastSync }))
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(Multisig.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'ProposalCreated':
        logger.verbose('ProposalCreated', llo(info))
        await ProposalHandler.proposalCreated(event, info)
        break
      case 'ProposalExecuted':
        logger.verbose('ProposalExecuted', llo(info))
        await ProposalHandler.proposalExecuted(event, info)
        break
      case 'MembersAdded':
        logger.verbose('MembersAdded', llo(info))
        await MultisigHandler.membersAdded(event, info)
        break
      case 'MembersRemoved':
        logger.verbose('MembersRemoved', llo(info))
        await MultisigHandler.membersRemoved(event, info)
        break
      case 'Approved':
        logger.verbose('Approved', llo(info))
        await ProposalHandler.approved(event, info)
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
      'Error LogMultisig',
      llo({
        error,
        network,
      }),
    )
  },
}
