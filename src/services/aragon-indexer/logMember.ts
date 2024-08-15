import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { MemberHandler } from '@services/aragon-indexer/handlers/memberHandler'
import { Multisig } from '@artifacts/Multisig'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMember' })

export const LogMember = {
  events: ['MembersAdded', 'MembersRemoved', 'DelegateChanged', 'DelegateVotesChanged'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogMember', llo({ networkName }))

        const multiSigTopics = Multisig.abi
          .filter((item: any) => item.type && LogMember.events.includes(item.name))
          .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

        const governanceTopics = GovernanceERC20.abi
          .filter((item: any) => item.type && LogMember.events.includes(item.name))
          .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: [...multiSigTopics, ...governanceTopics],
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogMember.processLog(txLog, networkName),
          onError: async (error: any) => LogMember.processError(error, networkName),
          logService: IEnumIndexerService.memberLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogMember', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
      }),
    )
  },

  getInterface(topic: string) {
    const eventsOfTokenVoting = [
      ethers.id('DelegateVotesChanged(address,uint256,uint256)'),
      ethers.id('DelegateChanged(address,address,address)'),
    ]

    return eventsOfTokenVoting.includes(topic) ? new Interface(GovernanceERC20.abi) : new Interface(Multisig.abi)
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = LogMember.getInterface(txLog.topics[0])
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'MembersAdded':
        logger.verbose('MembersAdded', llo(info))
        await MemberHandler.membersAdded(event, info)
        break
      case 'MembersRemoved':
        logger.verbose('MembersRemoved', llo(info))
        await MemberHandler.membersRemoved(event, info)
        break
      case 'DelegateChanged':
      case 'DelegateVotesChanged':
        logger.verbose('DelegateChanged', llo(info))
        await MemberHandler.delegateChanged(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogMember',
      llo({
        error,
        network,
      }),
    )
  },
}
