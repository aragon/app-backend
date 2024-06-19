import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type ITokenExtraParams,
  type ITokenResponse,
  type NetworksEnum,
} from '@types'
import CovalentHelper from '@helpers/covalent'
import { assertExposable } from '@errors'
import dayjs from '@helpers/dayjs'
import type Token from '@models/schema/token'

const TokenController = {
  getTokensWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ITokenExtraParams = {},
  ): Promise<IPaginatedResult<ITokenResponse>> => {
    const result = await Models.Token.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((token: Token) => token.filterKeys())
    return result
  },

  getTokenByAddress: async (params: { address: HexAddress; network: NetworksEnum }): Promise<ITokenResponse> => {
    let token = await Models.Token.findByTokenAddressAndNetwork(params.address, params.network)

    if (!token) {
      const cToken = await CovalentHelper.getToken(params.address, params.network)
      assertExposable(!!cToken, ErrorKeyEnum.notFound, undefined, undefined, params)
      token = await Models.Token.create({
        ...cToken,
        lastUpdatedAt: dayjs().utc().toDate(),
      })
    }

    return token.filterKeys()
  },
}

export default TokenController
