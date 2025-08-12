import { TokenGovernance } from './tokenGovernance'
import { Models } from '@dbModels'
import {
  type IPaginationParams,
  type IPaginatedResult,
  type IMemberExtraParams,
  type IMemberLockResponse,
} from '@types'

/**
 * VE (Vote Escrow) token governance implementation.
 * Uses the default TokenGovernance implementation.
 */
export class VeGovernance extends TokenGovernance {
  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMemberLockResponse>> {
    const { paginationParams = {}, extraParams = {} } = params

    const settings = await Models.Setting.findActive({
      network: extraParams.network,
      pluginAddress: extraParams.pluginAddress,
      tokenAddress: extraParams.tokenAddress,
    })

    const token = await Models.Token.findOne({
      address: extraParams.tokenAddress,
      network: extraParams.network,
    })

    return Models.Lock.getMembersOfVeLockPlugin({
      paginationParams,
      pluginAddress: extraParams.pluginAddress,
      settings: {
        currentTime: Math.floor(Date.now() / 1000),
        maxTime: settings.votingEscrow.maxTime,
        slope: settings.votingEscrow.slope,
        bias: settings.votingEscrow.bias,
        decimals: (BigInt(10) ** BigInt(token.decimals)).toString(),
      },
      tokenAddress: extraParams.tokenAddress,
      network: extraParams.network,
    })
  }
}
