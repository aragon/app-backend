import { type NetworksEnum, EnumQueueName, type IRawAction } from '@types'
import RabbitMQHelper from '@helpers/radditMQ'
import config from '@config'

const ContractController = {
  getContractDetails: async ({ network, address }: { network: NetworksEnum; address: string }) => {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        {
          id: `contractInfo-${network}-${address}`,
          params: { network, address },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (e) {
      return { error: true }
    }
  },

  decodeContractData: async ({ from, to, data, value, network }: IRawAction) => {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.contractDecoder,
        {
          id: `contractDecoder-${network}-${to}-${from}-${data}-${value}`,
          params: { from, to, data, value, network },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (e) {
      return { error: true }
    }
  },
}

export default ContractController
