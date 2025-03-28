import logger from '@logger'
import { EnumConnection, EnumQueueName, type IQueueRealtimeTransactions } from '@types'

import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
const llo = logger.logMeta.bind(null, { service: 'service:TransactionService' })

const AragonTransactionsService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('Aragon Transaction service started', llo({}))

    await RabbitMQHelper.process(EnumQueueName.realtimeTransactions, async job => {
      const { addresses, network, transactionHash } = job.params as IQueueRealtimeTransactions
      await BlockHandler.processReceiver(transactionHash, addresses, network)
    })
  },

  async stop() {
    logger.info('IndexerService service stopped', llo({}))
  },
}

export default AragonTransactionsService
