import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { Interface, zeroPadValue } from 'ethers'
import logger from '@logger'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import config from '@config'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:CustomInstall' })

export const CustomInstall = {
  daos: [
    {
      blockNumber: 20942377,
      subdomain: 'puffer-staking-voter',
      address: '0x5dEA8E499b05de8F86E7521F039770268055b23F',
      creator: '0x36b6fE474dAD8e822d3133B76E9adA671E75eC86',
      logIndex: 0,
      transactionIndex: 109,
      transactionHash: '0xf3172118b5f5eb9dee479d19137301f2007970318d1d7165f9e791c79f982b0f',
      network: NetworksEnum.ethereumMainnet,
      pluginSetupProcessor: {
        blockNumber: 16721862,
        address: '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f',
        transactionHash: '0x04ac8312403edfbc7b2bdbab0a2aca45f9b88d2fdfa9f8b2421f3acae84a42e5',
      },
    },
  ],

  install: async function () {
    if (!config.CUSTOM_INSTALL) {
      logger.info('Custom install is disabled')
      return
    }
    logger.info('CustomInstall start', llo({}))

    await Promise.all(
      CustomInstall.daos.map(async dao => {
        const provider = ProviderModule.getAnyRpcProvider(dao.network)
        if (!provider) return // network not supported

        const daoDb = await Models.Dao.findByAddress(dao.address, dao.network)
        if (daoDb) return

        const parsedEvent = { args: { dao: dao.address, subdomain: dao.subdomain, creator: dao.creator } }
        const info = {
          network: dao.network,
          blockNumber: dao.blockNumber,
          transactionIndex: dao.transactionIndex,
          logIndex: dao.logIndex,
          transactionHash: dao.transactionHash,
          address: dao.address,
          eventName: 'unknown',
        }
        await DaoRegistryHandler.daoRegistered(parsedEvent as any, info)

        // check if network is already sync then we need to manually sync the plugins
        const configIndexer = await Models.ConfigIndexer.findOne({
          service: `indexer-${dao.network}`,
        })

        // check if you need to sync
        if (!configIndexer || (configIndexer.lastSync > dao.blockNumber && dao.pluginSetupProcessor)) {
          await CustomInstall.pluginEvents(dao)
        }
      }),
    )

    logger.info('CustomInstall end', llo({}))
  },

  pluginEvents: async (dao: any) => {
    try {
      const configLogs = [
        {
          enableHistorical: false,
          event: 'InstallationPrepared',
          topic: [
            new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash!,
            null,
            zeroPadValue(dao.address, 32),
            null,
          ],
          config: [
            {
              abi: PluginSetupProcessor.abi,
              handler: PluginSetupProcessorHandler.installationPrepared,
            },
          ],
        },
        {
          enableHistorical: true, // only sync when applied
          event: 'InstallationApplied',
          topic: [
            new Interface(PluginSetupProcessor.abi).getEvent('InstallationApplied')?.topicHash!,
            zeroPadValue(dao.address, 32),
            null,
          ],
          config: [
            {
              abi: PluginSetupProcessor.abi,
              handler: PluginSetupProcessorHandler.installationApplied,
            },
          ],
        },
      ]

      const crawler = new BlockchainLogCrawler({
        network: dao.network,
        events: configLogs,
        fromBlock: dao.pluginSetupProcessor?.blockNumber,
        onError: async (error: any) => {
          logger.error('Error in log plugin setup processor', llo({ error, dao }))
        },
        logService: null,
        stopOnError: true,
        onlyHistorical: true,
        isTopicObject: true,
        skipLogProcessing: false,
      })
      await crawler.crawl()
    } catch (error) {
      logger.error('Error pluginEvents', llo({ error, dao }))
    }
  },
}
