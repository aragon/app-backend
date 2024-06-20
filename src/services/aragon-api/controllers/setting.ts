import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalsResponse,
  type ISettingExtraParams,
  type ISettingResponse,
  type NetworksEnum,
} from '@types'
import type Setting from '@models/schema/setting'
import { assertExposable } from '@errors'
import ModelUtils from '@models/utils/models'

const SettingController = {
  getSettingsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ISettingExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<ISettingResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }

    const result = await Models.Setting.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((setting: Setting) => setting.filterKeys())
    return result
  },

  getActiveSettingByDaoId: async (daoId: HexAddress): Promise<IProposalsResponse> => {
    const daoDb = await Models.Dao.findByEntityId(daoId)
    assertExposable(daoDb, ErrorKeyEnum.notFound)

    return SettingController.getActiveSettingByDaoAddress(daoDb.address, daoDb.network)
  },

  getActiveSettingByDaoAddress: async (daoAddress: HexAddress, network: NetworksEnum): Promise<IProposalsResponse> => {
    const setting = await Models.Setting.findActiveByDaoAddress(daoAddress, network)
    assertExposable(setting, ErrorKeyEnum.notFound)

    return setting.filterKeys()
  },
}

export default SettingController
