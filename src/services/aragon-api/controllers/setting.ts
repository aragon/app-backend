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

const SettingController = {
  getSettingsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ISettingExtraParams = {},
  ): Promise<IPaginatedResult<ISettingResponse>> => {
    const result = await Models.Setting.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((setting: Setting) => setting.filterKeys())
    return result
  },

  getSettingById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Setting.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },

  getSettingByTransactionHash: async (fromTxHash: HexAddress, network: NetworksEnum): Promise<IProposalsResponse> => {
    const proposal = await Models.Setting.findByTransactionHash(fromTxHash, network)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },
}

export default SettingController
