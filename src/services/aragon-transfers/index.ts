import logger from '@logger'
import { EnumConnection, EnumServiceName, type IService } from '@types'
import config from '@config'
import { TransferIndexer } from '@services/aragon-transfers/transferIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:AragonTransfers' })

const AragonTransfers: IService = {
  name: EnumServiceName.ARAGON_TRANSFERS,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  start: async function () {
    await TransferIndexer.start()

    logger.info('AragonTransfers service started', llo({}))
  },

  async stop() {
    logger.info('AragonTransfers service stopped', llo({}))
  },
}

export default AragonTransfers
