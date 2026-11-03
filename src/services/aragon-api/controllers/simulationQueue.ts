import config from '@config'
import * as Errors from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type ISimulationQueueResponse,
  type ITenderlyRequest,
  type ITenderlyRequestMap,
  type ITenderlyResult,
} from '@types'

const SimulationQueue = {
  async request<K extends keyof ITenderlyRequestMap>(request: ITenderlyRequest<K>): Promise<ITenderlyResult<K>> {
    const timeout = Math.min(config.SERVICES.ARAGON_API.TIMEOUT * 1000, config.RABBITMQ.TIMEOUT)
    const result: ISimulationQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.simulationRun,
      { id: request.operation, params: request },
      { waitResponse: true, timeout },
    )
    Errors.assertExposable(!!result && Date.now() < request.sentAt + timeout, ErrorKeyEnum.tooBusy)
    if ('errorKey' in result!) {
      const known = Object.values(ErrorKeyEnum).includes(result.errorKey)
      Errors.throwExposable(
        known ? result.errorKey : ErrorKeyEnum.simulationFailed,
        known ? result.status : undefined,
        known ? result.error : undefined,
      )
    }
    return result as ITenderlyResult<K>
  },
}

export default SimulationQueue
