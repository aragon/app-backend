import { EnumConnection, type IService, ITokenVotingLogs, NetworksEnum } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProposalHandler } from '@handlers/proposalHandler'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { Models } from '@dbModels'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'

export const FixMissingVotes: IService | any = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  transactions: ['0x344c0b2ab27b2b96192a83aa7214e0f939ddc78ab629e18214a4ac5778c98013'],

  start: async () => {
    const network = NetworksEnum.ethereumSepolia
    await Promise.all(
      FixMissingVotes.transactions.map(async (txHash: string) => {
        const tx = await LibUtils.getData(TokenVoting.abi, ITokenVotingLogs.VoteCast, txHash, network)

        for (const { event, logInfo } of tx) {
          await ProposalHandler.voteCast(event, logInfo)

          const proposalIndex = event.args.proposalId.toString()
          const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, logInfo.address, logInfo.network)

          await ProposalMetrics.proposalTokenVotingMetrics({
            proposalIndex,
            pluginAddress: proposal.pluginAddress,
            network,
          })

          await DaoMetrics.start({ daoAddress: proposal.daoAddress, network })
        }
      }),
    )
  },

  stop: async () => {},
}

export default FixMissingVotes
