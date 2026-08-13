/**
 * Dao service side of the SPP rule condition reader.
 *
 * Recognizing a rule condition reads its bytecode and calls `getRules()` on chain, so it needs a
 * service with RPC providers. The API has none - it boots with Mongo and RabbitMQ only - so it
 * sends every unknown SPP condition of one permissions response as a single `condition.sppRule`
 * message and waits for this reply.
 */

import config from '@config'
import ConditionDetector from '@helpers/conditionDetector'
import SppBodyConditionHelper from '@helpers/sppBodyCondition'
import logger from '@logger'
import {
  type HexAddress,
  IConditionInterfaceType,
  type IQueueSppRuleCondition,
  type ISppConditionRuleResponse,
  type ISppRuleConditionQueueResponse,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'dao:spp-rule-condition' })

export const SppRuleConditionDao = {
  async resolve(params: IQueueSppRuleCondition): Promise<ISppRuleConditionQueueResponse> {
    const { network, conditionAddresses } = params

    if (Date.now() - params.sentAt > config.RABBITMQ.TIMEOUT) {
      logger.warn('SPP rule condition: discarded stale queue request', llo({ network, sentAt: params.sentAt }))
      return { rulesByCondition: {} }
    }

    const rulesByCondition: Record<string, ISppConditionRuleResponse[]> = {}

    await Promise.all(
      conditionAddresses.map(async address => {
        try {
          const rules = await SppRuleConditionDao.readRules(address, network)
          if (rules) {
            rulesByCondition[address.toLowerCase()] = rules
          }
        } catch (error) {
          logger.warn('SPP rule condition: failed to resolve condition', llo({ address, network, error }))
        }
      }),
    )

    return { rulesByCondition }
  },

  async readRules(address: HexAddress, network: NetworksEnum): Promise<ISppConditionRuleResponse[] | null> {
    const conditionType = await ConditionDetector.detect(address, network)

    if (conditionType !== IConditionInterfaceType.sppRule) {
      return null
    }

    return await SppBodyConditionHelper.readSppRules(address, network)
  },
}
