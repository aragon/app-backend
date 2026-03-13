import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import Web3Helper from '@helpers/web3'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import { MemberGovernanceFactory } from '@src/governance'
import { type IIndexerConfig, type IMigration, IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillTokenDelegation' })

export const backfillTokenDelegationMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260311073027-backfillTokenDelegation' }))

    try {
      const adapterAddress = '0xda5Dc5d42184Ce218e9dCad68f175a2698371497'
      const network = NetworksEnum.ethereumMainnet

      const escrowAddress = await GovernanceVeHelper.getEscrowAddress(adapterAddress, network)
      if (!escrowAddress) {
        logger.error('Could not resolve escrow address from adapter', llo({ adapterAddress }))
        return
      }

      const plugin = await Models.Plugin.findOne({
        tokenAddress: adapterAddress,
        network,
        address: '0x17a1688C56087aDe762721180e1cC1E831C73719',
        daoAddress: '0xf204245b0B05E9A0780761E326552A569c1D6ceb',
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
        (item: IIndexerConfig) => item.event === 'TokensDelegated' || item.event === 'TokensUndelegated',
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
      logger.info(
        'Raw delegation logs fetched',
        llo({ count: rawLogs.length, crawlDurationMs: Date.now() - crawlStart }),
      )

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

        processed++
        if (processed % 100 === 0) {
          logger.info('Replay progress', llo({ processed, total: rawLogs.length }))
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260311073027-backfillTokenDelegation', processed }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260311073027-backfillTokenDelegation', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillTokenDelegationMigration
