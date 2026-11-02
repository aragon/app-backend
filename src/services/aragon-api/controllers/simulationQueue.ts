import config from '@config'
import * as Errors from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type IQueueSimulation,
  type ISimulationQueueResponse,
  type ISimulationResult,
} from '@types'

const SimulationQueue = {
  async request(request: IQueueSimulation): Promise<ISimulationResult> {
    const timeout = Math.min(config.SERVICES.ARAGON_API.TIMEOUT * 1000, config.RABBITMQ.TIMEOUT)
    const result: ISimulationQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.simulationRun,
      { id: request.operation, params: request },
      { waitResponse: true, timeout },
    )
    Errors.assertExposable(!!result && Date.now() < request.sentAt + timeout, ErrorKeyEnum.tooBusy)
    if ('error' in result!) {
      const known = Object.values(ErrorKeyEnum).includes(result.errorKey)
      Errors.throwExposable(
        known ? result.errorKey : ErrorKeyEnum.simulationFailed,
        known ? result.status : undefined,
        known ? result.error : undefined,
      )
    }
    return result as ISimulationResult
  },
}

export default SimulationQueue
