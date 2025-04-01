import logger from '@logger'
import { EnumQueueName, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Dao from '@models/schema/dao'
import utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-transactions:BlockHandler' })

export const BlockHandler = {
  processReceiver: async (transactionHash: string, toAddresses: string[], network: NetworksEnum) => {
    const daos = await Models.Dao.find({ address: { $in: toAddresses }, network })
    if (!daos || daos.length === 0) return

    // wait for confirmation blocks
    await utils.wait(config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME * 1000)

    await Promise.all(
      daos.map(async (dao: any) => {
        logger.verbose(
          'New confirmed incoming transaction',
          llo({
            network,
            daoAddress: dao.address,
            transactionHash,
          }),
        )
        await BlockHandler.sendDaoMessages(dao)
      }),
    )
  },

  sendDaoMessages: async (dao: Dao) => {
    await Promise.allSettled([
      RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
        id: dao.address,
        params: { address: dao.address, network: dao.network },
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
        id: dao.address,
        params: { address: dao.address, network: dao.network },
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: dao.address,
        params: { address: dao.address, network: dao.network },
      }),
    ])
  },
}
