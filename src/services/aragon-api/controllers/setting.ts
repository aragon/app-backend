import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IProposalsResponse,
  type ISettingExtraParams,
  type ISettingResponse,
  type NetworksEnum,
} from '@types'
import type Setting from '@models/schema/setting'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const SettingController = {
  getSettingsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ISettingExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<ISettingResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
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
