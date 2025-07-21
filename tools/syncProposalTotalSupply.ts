import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'

export const SyncProposalTotalSupply: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    // sync initial tokens
    const proposals = await Models.Proposal.find({ 'snapshot.totalSupply': '0' })

    await Promise.all(
      proposals.map(async (proposal: any) => {
        const token = await Models.Token.findOne({
          address: proposal.settings.tokenAddress,
          network: proposal.network,
        })
        proposal.snapshot.totalSupply = await GovernanceErc20Helper.getPastTotalSupply({
          blockNumber: proposal.blockNumber,
          tokenAddress: proposal?.settings.tokenAddress,
          network: proposal.network,
          blockTimestamp: proposal.blockTimestamp,
          hasClockMode: token?.hasClockMode,
        })

        proposal.markModified('snapshot')
        await proposal.save()
      }),
    )
  },

  stop: async () => {},
}

export default SyncProposalTotalSupply
