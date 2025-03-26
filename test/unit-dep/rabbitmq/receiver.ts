import RabbitMQHelper from '@helpers/rabbitMQ'

const ReceiverRabbitMQ = {
  receiveMessage: async (queueName: string, callback: any): Promise<void> => {
    await RabbitMQHelper.process(queueName as any, callback)
  },
}

export default ReceiverRabbitMQ
