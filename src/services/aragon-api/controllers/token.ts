import { Models } from '@dbModels'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type ITokenExtraParams,
  type ITokenResponse,
  type NetworksEnum,
} from '@types'
import { assertExposable } from '@errors'
import type Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import RabbitMQHelper from '@helpers/rabbitMQ'

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
      token = await ProxyToken.saveAndGetToken(params.address, params.network)
      assertExposable(!!token, ErrorKeyEnum.notFound, undefined, undefined, params)
    }

    return token.filterKeys()
  },

  getTokenStats: async (params: { address: HexAddress; network: NetworksEnum }): Promise<any> => {
    const token = await Models.Token.findByTokenAddressAndNetwork(params.address, params.network)
    assertExposable(!!token, ErrorKeyEnum.notFound, undefined, undefined, params)

    return RabbitMQHelper.sendMessage(
      EnumQueueName.getTokenStats,
      {
        id: `getTokenStats-${params.address}-${params.network}`,
        params: {
          address: params.address,
          network: params.network,
        },
      },
      { waitResponse: true, timeout: 10000 },
    )
  },
}

export default TokenController
