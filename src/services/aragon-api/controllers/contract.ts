import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { EnumQueueName, type IQueueContractDecoderLight, type IRawAction, type NetworksEnum } from '@types'

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
    } catch (_e) {
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
    } catch (_e) {
      return { error: true }
    }
  },

  decodeContractDataBatch: async (params: IQueueContractDecoderLight) => {
    try {
      const actionHashes = params.actions.map(a => `${a.to}-${a.data.slice(0, 10)}`).join('|')
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.contractDecoderLight,
        {
          id: `contractDecoderLight-${params.network}-${actionHashes}`,
          params,
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (_e) {
      return { error: true }
    }
  },
}

export default ContractController
