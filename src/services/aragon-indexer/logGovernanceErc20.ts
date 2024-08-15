import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { MemberHandler } from '@services/aragon-indexer/handlers/memberHandler'
import { Multisig } from '@artifacts/Multisig'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogGovernanceErc20' })

export const LogGovernanceErc20 = {
  events: ['Transfer', 'DelegateChanged', 'DelegateVotesChanged'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogGovernanceErc20', llo({ networkName }))

        const governanceTopics = GovernanceERC20.abi
          .filter((item: any) => item.type && LogGovernanceErc20.events.includes(item.name))
          .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

        const filter = {
          address: '0x28aFf8e04c883B49Ebab5AaA5C7c3fdcAbC32713',
          topics: [...governanceTopics],
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogGovernanceErc20.processLog(txLog, networkName),
          onError: async (error: any) => LogGovernanceErc20.processError(error, networkName),
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
      ethers.id('Transfer(address,address,uint256)'),
    ]

    return eventsOfTokenVoting.includes(topic) ? new Interface(GovernanceERC20.abi) : new Interface(Multisig.abi)
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    if(txLog.transactionHash === '0xf6191725d3a9944a3483554a2660caca99ee52d1e380d45b3f8614cf368f8861') {
      console.log(txLog)
    }
    const iFace = LogGovernanceErc20.getInterface(txLog.topics[0])
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'Transfer':
        logger.verbose('Transfer', llo(info))
        // await MemberHandler.transfer(event, info)
        const history = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.blockNumber,
          address: '1',
          daoAddress: '',
          pluginAddress: '',
          tokenAddress: '',
          votingPower: '123123', // voting power will be same as balance
          balance: '123123'
        }
        break
      case 'DelegateChanged':
        logger.verbose('DelegateChanged', llo(info))
        // await MemberHandler.delegateChanged(event, info)
        const history = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.blockNumber,
          address: '1',
          daoAddress: '',
          pluginAddress: '',
          tokenAddress: '',
          votingPower: '0', // voting power will be same as balance
          balance: '123123'
        }
        const history = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.blockNumber,
          address: '2',
          daoAddress: '',
          pluginAddress: '',
          tokenAddress: '',
          votingPower: '123123',
          balance: '0'
        }
        break
      case 'DelegateVotesChanged':
        logger.verbose('DelegateVotesChanged', llo(info))
        // await MemberHandler.delegateChanged(event, info)
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
