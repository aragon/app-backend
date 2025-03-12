import logger from '@logger'
import { EnumQueueName, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Dao from '@models/schema/dao'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-transactions:BlockHandler' })

export const BlockHandler = {
  processReceiver: async (transactionHash: string, toAddresses: string[], network: NetworksEnum) => {
    const daos = await Models.Dao.find({ address: { $in: toAddresses }, network })
    if (!daos || daos.length === 0) return

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
    try {
      await Promise.all([
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
      logger.info(`RabbitMQ messages sent for DAO: ${dao.address}`, llo({ dao }))
    } catch (error) {
      logger.error('Failed to send RabbitMQ messages', llo({ daoAddress: dao.address, error }))
    }
  },
}
