import RabbitMQHelper from '@helpers/rabbitMQ'
import { EnumQueueName, type HexAddress, type NetworksEnum } from '@types'

const Queue = {
  /** Recompute one DAO's metrics. `sendMessage` never throws, it logs and returns. */
  async daoMetrics(daoAddress: HexAddress, network: NetworksEnum): Promise<void> {
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: daoAddress,
      params: { address: daoAddress, network },
    })
  },
}

export default Queue
