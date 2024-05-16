import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { Multisig } from '@artifacts/Multisig'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMember' })

export const LogMember = {
  events: ['MembersAdded', 'MembersRemoved', 'DelegateChanged'],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogMember', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const multiSigTopics = Multisig.abi
        .filter((item: any) => item.type && LogMember.events.includes(item.name))
        .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

      const governanceTopics = GovernanceERC20.abi
        .filter((item: any) => item.type && LogMember.events.includes(item.name))
        .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: [...multiSigTopics, ...governanceTopics],
        fromBlock: networkDb.lastBlockMember,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => LogMember.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => LogMember.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockMember')
    }
    logger.verbose('Finish LogMember', llo())
  },

  getInterface(topic: string) {
    const eventsOfTokenVoting = [
      ethers.id('DelegateVotesChanged(address,uint256,uint256)'),
      ethers.id('DelegateChanged(address,address,address)'),
    ]

    return eventsOfTokenVoting.includes(topic) ? new Interface(GovernanceERC20.abi) : new Interface(Multisig.abi)
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const iFace = LogMember.getInterface(txLog.topics[0])

    let event = null as any
    try {
      event = iFace.parseLog(txLog)!
    } catch (error: any) {
      if (error?.message.includes('out-of-bounds')) {
        return
      }
    }

    switch (event.name) {
      case 'MembersAdded':
        logger.verbose('MembersAdded', llo({ event }))
        await MemberHandler.membersAdded(event, txLog, network)
        break
      case 'MembersRemoved':
        logger.verbose('MembersRemoved', llo({ event }))
        await MemberHandler.membersRemoved(event, txLog, network)
        break
      case 'DelegateChanged':
        logger.verbose('DelegateChanged', llo({ event }))
        await MemberHandler.delegateChanged(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
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
