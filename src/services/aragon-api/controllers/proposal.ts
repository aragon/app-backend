import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type NetworksEnum,
  type HexAddress,
} from '@types'
import { assertExposable } from '@errors'
import type Proposal from '@models/schema/proposal'
import ModelUtils from '@models/utils/models'

const ProposalController = {
  getProposalsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IProposalExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<IProposalsResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }

    const result = await Models.Proposal.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((proposal: Proposal) => proposal.filterKeys())
    return result
  },

  getProposalById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },

  getProposalByTransactionHash: async (
    transactionHash: HexAddress,
    network: NetworksEnum,
  ): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByTransactionHash(transactionHash, network)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },
}

export default ProposalController
