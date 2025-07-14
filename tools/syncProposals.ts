import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'

export const SyncProposals: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const proposals = await Models.Proposal.find({
      'snapshot.totalSupply': '0',
    })

    for (const proposal of proposals) {
      const pastTotalSupply = await GovernanceErc20Helper.getPastTotalSupply({
        blockNumber: proposal.blockNumber,
        tokenAddress: proposal.settings.tokenAddress,
        network: proposal.network,
      })

      proposal.snapshot.totalSupply = pastTotalSupply.toString()
      await proposal.save()
    }
  },

  stop: async () => {},
}

export default SyncProposals
