import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type ISettingExtraParams,
  type ISettingResponse,
  ISettingStatus,
  type NetworksEnum,
} from '@types'

const SettingController = {
  getSettingsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ISettingExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<ISettingResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.Setting.findWithPagination({ extraParams, paginationParams })

    return result
  },

  getActiveSettingByDaoId: async (daoId: HexAddress, pluginAddress: HexAddress): Promise<ISettingResponse> => {
    const daoDb = await Models.Dao.findByEntityId(daoId)
    assertExposable(daoDb, ErrorKeyEnum.notFound)

    return SettingController.getActiveSettingByDaoAddress(daoDb.address, daoDb.network, pluginAddress)
  },

  getActiveSettingByDaoAddress: async (
    daoAddress: HexAddress,
    network: NetworksEnum,
    pluginAddress: HexAddress,
  ): Promise<ISettingResponse> => {
    const setting = await Models.Setting.findSetting({
      daoAddress,
      network,
      status: ISettingStatus.active,
      pluginAddress,
    })
    assertExposable(setting, ErrorKeyEnum.notFound)
    return setting
  },
}

export default SettingController
