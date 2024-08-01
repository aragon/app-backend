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
import ActionTransformer from '@helpers/actionTransformer'

const ProposalController = {
  getProposalById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)
    const proposalActions = await Promise.all(
      proposal.actions.map(async (action: any) => {
        return await ActionTransformer.handleAction(action, proposal)
      }),
    )

    return {
      ...proposal.filterKeys(),
      actions: proposalActions,
    }
  },

  getProposalByTransactionHash: async (
    transactionHash: HexAddress,
    network: NetworksEnum,
  ): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findByTransactionHash(transactionHash, network)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    return proposal.filterKeys()
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
