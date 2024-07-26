import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type NetworksEnum,
  type HexAddress,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const ProposalController = {
  getProposalsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IProposalExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IProposalsResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Proposal.findWithPagination({ extraParams, paginationParams })
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
