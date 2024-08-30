import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const ProposalController = {
  getProposalById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findWithEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)
    return proposal
  },

  getProposalsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IProposalExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IProposalsResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Proposal.findWithPagination({ extraParams, paginationParams })
  },
}

export default ProposalController
