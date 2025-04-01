import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import logger from '@logger'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import { Interface, zeroPadValue } from 'ethers'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'

describe.only('BlockchainLogCrawler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('should simulate the transaction crawler of a dao', async function () {
    this.timeout(100000000000)
    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

        const crawler = new BlockchainLogCrawler({
          // onlyHistorical: true,
          // oneBlockPerTime: true,
          // strategy: ICrawStrategy.getBlockReceipts,
          network: networkName,
          events: configIndexer,
          filterLogs: logs => logs,
          onError: async (error: any) => logger.error('Error Indexer', { error }),
          logService: `indexer-${networkName}`,
          stopOnError: true,
        })
        await crawler.crawl()

        const configLogs2 = [
          {
            enableHistorical: false,
            event: 'InstallationPrepared',
            topic: [
              new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash!,
              null,
              zeroPadValue('0x5dEA8E499b05de8F86E7521F039770268055b23F', 32),
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
              zeroPadValue('0x5dEA8E499b05de8F86E7521F039770268055b23F', 32),
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

        // const crawler2 = new BlockchainLogCrawler({
        //   onlyHistorical: true,
        //   // oneBlockPerTime: true,
        //   network: networkName,
        //   events: configLogs2,
        //   onError: async (error: any) => logger.error('Error Indexer', { error }),
        //   logService: `indexer-${networkName}`,
        //   stopOnError: true,
        //   isTopicObject: true,
        // })
        // await crawler2.crawl()

        console.log('Crawler started')
      }),
    )
  })
})
