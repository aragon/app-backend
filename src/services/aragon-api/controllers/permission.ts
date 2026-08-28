import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { PermissionEntityEnrichment } from '@modules/permissionEntities'
import {
  EnumQueueName,
  type HexAddress,
  type IPaginationParams,
  type IPermissionResponse,
  type IQueueSppRuleCondition,
  type ISppConditionRuleResponse,
  type ISppRuleConditionQueueResponse,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'controller:Permission' })

const PermissionController = {
  getPermissionsByDao: async (daoAddress: HexAddress, network: NetworksEnum, paginationParams: IPaginationParams) => {
    const result = await Models.DaoPermission.findWithPagination({
      extraParams: { daoAddress, network },
      paginationParams,
    })

    if (result.data.length === 0) {
      return result
    }

    return {
      ...result,
      data: await PermissionEntityEnrichment.enrich(
        Models.DaoPermission.db,
        result.data as IPermissionResponse[],
        { daoAddress, network },
        PermissionController.resolveSppRules,
      ),
    }
  },

  resolveSppRules: async (
    conditionAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Record<string, ISppConditionRuleResponse[]> | null> => {
    const params: IQueueSppRuleCondition = { sentAt: Date.now(), network, conditionAddresses }

    const result: ISppRuleConditionQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.sppRuleCondition,
      { id: `${network}-${conditionAddresses.join('-')}`, params },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    if (!result?.rulesByCondition) {
      logger.warn('Failed to resolve SPP rule conditions', llo({ network, conditionAddresses }))
      return null
    }

    return result.rulesByCondition
  },
}

export default PermissionController
