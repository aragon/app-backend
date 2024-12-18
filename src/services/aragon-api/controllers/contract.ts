import { type NetworksEnum, EnumQueueName } from '@types'
import { RabbitMQHelper } from '@helpers/redditMQ'
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
}

export default ContractController
