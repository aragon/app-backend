import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IVoteExtraParams,
  type IVoteResponse,
  type ICanVoteParams,
} from '@types'
import PairDataModule from '@modules/pairData'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Vote.findWithPagination({ extraParams, paginationParams })
  },

  memberVotesInfo: async (params: ICanVoteParams) => {
    const userVotingStatus = await Models.Vote.findVoteOnPlugin({
      memberAddress: params.memberAddress,
      pluginAddress: params.pluginAddress,
      network: params.network,
      proposalIndex: params.proposalIndex,
    })

    if (!userVotingStatus) {
      return false
    }

    return {
      transactionHash: userVotingStatus.transactionHash,
      transactionIndex: userVotingStatus.transactionIndex,
      blockNumber: userVotingStatus.blockNumber,
      blockTimestamp: userVotingStatus.blockTimestamp,
      voteOption: userVotingStatus.voteOption,
      votingPower: userVotingStatus.votingPower,
      replacedTransactionHash: userVotingStatus.replacedTransactionHash,
      daoAddress: userVotingStatus.daoAddress,
      pluginAddress: userVotingStatus.pluginAddress,
      proposalIndex: userVotingStatus.proposalIndex,
      network: userVotingStatus.network,
    }
  },
}

export default VoteController
