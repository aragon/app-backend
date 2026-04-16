import { Models } from '@dbModels'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import GovernanceVeHelper from '@helpers/governanceVe'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { MemberGovernanceFactory } from '@src/governance'
import {
  EnumConnection,
  EnumQueueName,
  type IIndexerConfig,
  IPluginInterfaceType,
  type IQueueDao,
  type IService,
  ITokenType,
  NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:backfillTokenDelegation' })

export const BackfillTokenDelegation: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    logger.info('Starting BackfillTokenDelegation tool', llo({}))

    await RabbitMQHelper.process(EnumQueueName.daoMetrics, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoMetrics.start({ daoAddress: address, network })
    })

    const adapterAddress = '0xA01de789D297B568A20e462660E3e9fB5553677e'
    const network = NetworksEnum.ethereumSepolia

    if (!adapterAddress) {
      logger.error('adapterAddress is not set', llo({}))
      return
    }

    // Reset lock delegateReceiverAddress before replay
    const updateResult = await Models.Lock.updateMany(
      { network, tokenAddress: adapterAddress },
      { $set: { delegateReceiverAddress: null } },
    )
    logger.info('Lock delegateReceiverAddress reset', llo({ modifiedCount: updateResult.modifiedCount }))

    const escrowAddress = await GovernanceVeHelper.getEscrowAddress(adapterAddress, network)
    if (!escrowAddress) {
      logger.error('Could not resolve escrow address from adapter', llo({ adapterAddress }))
      return
    }

    const plugin = await Models.Plugin.findOne({
      tokenAddress: adapterAddress,
      network,
      address: '0x1652FDd272fEf49B53bd102550DE775519e60b8E',
      daoAddress: '0x5b0348810D4576d2B6002214aF0608318748b9A6',
    })

    if (!plugin) {
      logger.error('No plugin found for adapter', llo({ adapterAddress, network }))
      return
    }

    const adapterCreationInfo = await evmExplorerClient.fetchContractCreation(
      EvmExplorerEnum.ETHERSCAN,
      adapterAddress,
      network,
    )
    if (!adapterCreationInfo?.blockNumber) {
      logger.error('Could not fetch adapter creation block number', llo({ adapterAddress, network }))
      return
    }

    logger.info('Resolved addresses', llo({ adapterAddress, escrowAddress, adapterCreationInfo }))

    // Step 1: Crawl raw logs with skipLogProcessing to get them in on-chain order
    const events = configIndexer.filter(
      (item: IIndexerConfig) =>
        item.event === 'TokensDelegated' || item.event === 'TokensUndelegated' || item.event === 'DelegateChanged',
    )

    const crawler = new BlockchainLogCrawler({
      network,
      events,
      address: [adapterAddress],
      fromBlock: adapterCreationInfo.blockNumber,
      skipLogProcessing: true,
      onError: async error => {
        logger.error('Delegation crawl error', llo({ adapterAddress, error }))
      },
      stopOnError: false,
    })

    const crawlStart = Date.now()
    const rawLogs = (await crawler.crawl()) || []
    logger.info('Raw delegation logs fetched', llo({ count: rawLogs.length, crawlDurationMs: Date.now() - crawlStart }))

    // Step 2: Replay each log in on-chain order to upsert TokenDelegation + fix delegateReceiverAddress
    const governance = MemberGovernanceFactory.create({
      address: escrowAddress,
      network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenType: ITokenType.escrowAdapter,
      extraParams: {
        escrowAdapterAddress: adapterAddress,
      },
    })

    let processed = 0
    for (const log of rawLogs) {
      const { event: parsedEvent, info } = log
      const eventName = info.eventName

      if (eventName === 'DelegateChanged') {
        const existing = await Models.LogDelegateChanged.findExistingLog({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
        })
        if (!existing) {
          await Models.LogDelegateChanged.create({
            tokenAddress: info.address,
            network: info.network,
            delegator: parsedEvent.args.delegator,
            fromDelegate: parsedEvent.args.fromDelegate,
            toDelegate: parsedEvent.args.toDelegate,
            blockNumber: info.blockNumber,
            blockTimestamp: await Web3Helper.getBlockTimestamp(info.blockNumber, info.network),
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
          })
        }
      } else {
        const fromAddress = parsedEvent.args.sender
        const toAddress = parsedEvent.args.delegatee
        const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

        // Upsert TokenDelegation record
        const existingLog = await Models.TokenDelegation.findExistingLog({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
        })
        if (!existingLog) {
          await Models.TokenDelegation.createLog({
            network: info.network,
            contractAddress: info.address,
            delegator: fromAddress,
            delegate: toAddress,
            tokenIds,
            action: eventName === 'TokensDelegated' ? 'delegate' : 'undelegate',
            blockNumber: info.blockNumber,
            blockTimestamp: await Web3Helper.getBlockTimestamp(info.blockNumber, info.network),
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
          })
        }

        // Fix delegateReceiverAddress
        await MemberGovernanceFactory.createBaseMember(fromAddress, info.blockNumber)

        if (eventName === 'TokensDelegated') {
          const isSelfDelegation = fromAddress === toAddress
          if (!isSelfDelegation) {
            await MemberGovernanceFactory.createBaseMember(toAddress, info.blockNumber)
          }

          await governance.update(toAddress, {
            tokenIds,
            delegateReceiverAddress: toAddress,
            info,
          })
        } else if (eventName === 'TokensUndelegated') {
          await governance.update(fromAddress, {
            tokenIds,
            delegateReceiverAddress: null,
            info,
          })
        }
      }

      processed++
      if (processed % 100 === 0) {
        logger.info('Replay progress', llo({ processed, total: rawLogs.length }))
      }
    }

    logger.info('BackfillTokenDelegation completed', llo({ processed }))
  },

  stop: async () => {},
}

export default BackfillTokenDelegation
