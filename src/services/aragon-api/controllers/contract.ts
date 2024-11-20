import { type NetworksEnum, EnumQueueName } from '@types'
import { RabbitMQHelper } from '@helpers/redditMQ'

const ContractController = {
  getContractDetails: async ({ network, address }: { network: NetworksEnum; address: string }) => {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        {
          id: `contractInfo-${network}-${address}`,
          params: { network, address },
        },
        { waitResponse: true, timeout: 15000 },
      )
    } catch (e) {
      return { error: true }
    }
  },
}

export default ContractController
