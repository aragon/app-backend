import RabbitMQHelper from "@helpers/rabbitMQ";
import {EnumQueueName} from "@types";

const SenderRabbitMQ = {
  sendMessage: async (queueName: string, data: {id: string, params: any}): Promise<void> => {
    await RabbitMQHelper.sendMessage(queueName as any, {
      id: data.id,
      params: data.params
    })
  }
}

export default SenderRabbitMQ
