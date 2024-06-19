import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type NetworksEnum,
} from '@types'
import { assertExposable } from '@errors'
import type Proposal from '@models/schema/proposal'

const ProposalController = {
  getProposalsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IProposalExtraParams = {},
  ): Promise<IPaginatedResult<IProposalsResponse>> => {
    const result = await Models.Proposal.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((proposal: Proposal) => proposal.filterKeys())
    return result
  },

  getProposalById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },

  getProposalByTransactionHash: async (transactionHash: string, network: NetworksEnum): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByTransactionHash(transactionHash, network)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
  },
}

export default ProposalController
