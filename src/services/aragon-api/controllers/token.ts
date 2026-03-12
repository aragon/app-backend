import config from '@config'
import { Models } from '@dbModels'
import { assertExposable, throwExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Token from '@models/schema/token'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IGetGovernanceRewardDistribution,
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

  getGovernanceRewards: async (params: IGetGovernanceRewardDistribution) => {
    const lookbackTs = Math.floor(new Date(params.lookbackDate).getTime() / 1000)
    const now = Math.floor(Date.now() / 1000)

    if (lookbackTs >= now) {
      throwExposable(ErrorKeyEnum.badParams, null, 'lookbackDate must be in the past')
    }

    const result = await RabbitMQHelper.sendMessage(
      EnumQueueName.governanceRewardDistribution,
      {
        id: `${params.pluginAddress}-${params.network}-governance-rewards`,
        params,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    assertExposable(!!result, ErrorKeyEnum.notFound, undefined, undefined, params)

    if (result.error) {
      throwExposable(ErrorKeyEnum.notFound, null, result.error)
    }

    return result
  },
}

export default TokenController
