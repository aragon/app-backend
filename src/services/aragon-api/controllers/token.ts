import config from '@config'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Token from '@models/schema/token'
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
      await RabbitMQHelper.sendMessage(
        EnumQueueName.tokenInfo,
        {
          id: `tokenInfo-${params.network}-${params.address}`,
          params: { address: params.address, network: params.network },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
      token = await Models.Token.findByTokenAddressAndNetwork(params.address, params.network)
      assertExposable(!!token, ErrorKeyEnum.notFound, undefined, undefined, params)
    }

    return token.filterKeys()
  },
}

export default TokenController
