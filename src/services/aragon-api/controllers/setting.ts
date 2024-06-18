import { Models } from '@dbModels'
import { type IPaginatedResult, type IPaginationParams, type ISettingExtraParams, type ISettingResponse } from '@types'
import type Setting from '@models/schema/setting'

const SettingController = {
  getSettingsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ISettingExtraParams = {},
  ): Promise<IPaginatedResult<ISettingResponse>> => {
    const result = await Models.Setting.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((setting: Setting) => setting.filterKeys())
    return result
  },
}

export default SettingController
