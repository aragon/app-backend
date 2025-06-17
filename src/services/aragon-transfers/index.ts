import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import utils from '@helpers/utils'
import config from '@config'
import TransferCrawler from './transferCrawler'
import { Models } from '@dbModels'
const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const AragonTransferService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  repeaters: {},

  start: async function () {
    const networks = NetworkHelper.supportedNetworks()
    await Promise.all(
      networks.map(async ({ networkName }) => {
        const logService: any = `transfers-${networkName}`

        logger.info('TransferCrawler start', llo({ networkName }))

        const existingConfig = await Models.ConfigIndexer.findExistingLog({
          network: networkName,
          service: logService!,
        })

        if (!existingConfig) {
          const indexerLastSync = await Models.ConfigIndexer.findExistingLog({
            network: networkName,
            service: `indexer-${networkName}`,
          })

          if (indexerLastSync) {
            await Models.ConfigIndexer.create({
              network: networkName,
              service: logService!,
              lastSync: indexerLastSync?.lastSync || 0,
            })
          }
        }

        const taskOptions = {
          fn: () => [[{ poolingCrawler: TransferCrawler, params: { logService, network: networkName } }]],
          interval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL,
          checkInterval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL / 2,
          runNow: true,
          stopOnError: false,
          onError: (error: any) => logger.error('Error pooling logs', llo({ networkName, error })),
        }

        const scheduler = TaskSchedulerState.getInstance()
        await scheduler.startTask(logService, taskOptions)
      }),
    )
  },

  stop: async function () {
    logger.info('Transfer service stopped', llo({}))
  },
}

export default AragonTransferService
