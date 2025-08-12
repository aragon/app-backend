import { TokenGovernance } from './tokenGovernance'
import { Models } from '@dbModels'
import { type IPaginationParams, type IPaginatedResult, type IMembersResponse, type IMemberExtraParams } from '@types'

/**
 * ERC20 token governance implementation.
 * Uses the default TokenGovernance implementation.
 */
export class Erc20Governance extends TokenGovernance {
  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const { paginationParams = {}, extraParams = {} } = params

    const enrichedExtraParams: IMemberExtraParams = {
      ...extraParams,
      tokenAddress: this.tokenAddress,
      network: this.network,
    }

    return Models.TokenMember.findAndPaginate({
      paginationParams,
      extraParams: enrichedExtraParams,
    })
  }
}
