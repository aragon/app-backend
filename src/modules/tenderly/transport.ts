import config, { TENDERLY_RESPONSE_MARGIN_MS } from '@config'
import * as Errors from '@errors'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import {
  ErrorKeyEnum,
  type ITenderlyFullSimulationResponse,
  type ITenderlyPayload,
  type ITenderlySendContext,
} from '@types'
import axios from 'axios'
import Bottleneck from 'bottleneck'
import { isHexString } from 'ethers'
import TenderlyBudget from './budget'

const llo = logger.logMeta.bind(null, { service: 'tenderly-transport' })

const TenderlyTransport = {
  deadlineAt(sentAt: number): number {
    const deadlineAt =
      sentAt +
      Math.min(config.SERVICES.ARAGON_API.TIMEOUT * 1000, config.RABBITMQ.TIMEOUT) -
      TENDERLY_RESPONSE_MARGIN_MS
    TenderlyTransport._remaining(deadlineAt)
    return deadlineAt
  },

  async simulate(payload: ITenderlyPayload, context: ITenderlySendContext): Promise<ITenderlyFullSimulationResponse> {
    TenderlyTransport._remaining(context.deadlineAt)
    Errors.assertExposable(isHexString(payload.input, true), ErrorKeyEnum.badSimulationRequest)
    Errors.assertExposable(
      !!(config.TENDERLY.API_URL && config.TENDERLY.USER && config.TENDERLY.PROJECT && config.TENDERLY.ACCESS_KEY),
      ErrorKeyEnum.tooBusy,
    )
    try {
      return await BottleneckModule.getTenderlyLimiter().schedule(async () => {
        TenderlyTransport._remaining(context.deadlineAt)
        if (context.budgetExemption !== 'internalAssessment') {
          await TenderlyBudget.consumeApiBudget(context, Date.now())
        }
        const response = await TenderlyTransport._post('/simulate', payload, context.deadlineAt)
        Errors.assertExposable(
          typeof response?.simulation?.id === 'string' &&
            response.simulation.id.length > 0 &&
            typeof response?.transaction?.status === 'boolean',
          ErrorKeyEnum.simulationFailed,
        )
        return response
      })
    } catch (error: any) {
      if (Errors.isExposableError(error)) throw error
      if (error instanceof Bottleneck.BottleneckError) Errors.throwExposable(ErrorKeyEnum.tooBusy)
      logger.warn('Tenderly simulation request failed', llo({ status: error?.response?.status }))
      Errors.throwExposable(ErrorKeyEnum.simulationFailed)
    }
  },

  async share(id: string, deadlineAt: number): Promise<string> {
    const fallback = `${config.TENDERLY.SHARING_BASE_URL}/shared/simulation/${id}`
    try {
      TenderlyTransport._remaining(deadlineAt)
      const response = await BottleneckModule.getTenderlyLimiter().schedule(() =>
        TenderlyTransport._post(`/simulations/${encodeURIComponent(id)}/share`, undefined, deadlineAt),
      )
      return typeof response?.share_url === 'string' ? response.share_url : fallback
    } catch {
      return fallback
    }
  },

  _remaining(deadlineAt: number): number {
    const remaining = deadlineAt - Date.now()
    Errors.assertExposable(Number.isFinite(remaining) && remaining > 0, ErrorKeyEnum.tooBusy)
    return remaining
  },

  async _post(path: string, payload: ITenderlyPayload | undefined, deadlineAt: number): Promise<any> {
    const timeout = TenderlyTransport._remaining(deadlineAt)
    const baseUrl = `${config.TENDERLY.API_URL}/account/${config.TENDERLY.USER}/project/${config.TENDERLY.PROJECT}`
    const response = await axios.post(`${baseUrl}${path}`, payload, {
      headers: { 'X-Access-Key': config.TENDERLY.ACCESS_KEY, 'Content-Type': 'application/json' },
      timeout,
      maxRedirects: 0,
    })
    return response.data
  },
}

export default TenderlyTransport
