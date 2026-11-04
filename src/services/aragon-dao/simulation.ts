import { ERRORS, isExposableError } from '@errors'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import { ErrorKeyEnum, type IQueueSimulation, type ISimulationQueueResponse } from '@types'

const llo = logger.logMeta.bind(null, { service: 'dao:simulation' })

const SimulationDao = {
  async run(request: IQueueSimulation): Promise<ISimulationQueueResponse> {
    try {
      return await TenderlyModule.run(request)
    } catch (error: any) {
      if (isExposableError(error)) {
        logger.warn('Simulation: run rejected', llo({ errorKey: error.message }))
        return { error: error.description, errorKey: error.message as ErrorKeyEnum, status: error.status }
      }
      logger.warn(
        'Simulation: run failed',
        llo({ errorKey: ErrorKeyEnum.tooBusy, error: error?.message ?? String(error) }),
      )
      return { error: ERRORS[ErrorKeyEnum.tooBusy].description, errorKey: ErrorKeyEnum.tooBusy }
    }
  },
}

export default SimulationDao
