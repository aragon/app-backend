import { EnumConnection, type IService, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'tool:fixSppPair' })

export const FixSppPair: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const proposalParent = await Models.Proposal.findOne({
      daoAddress: '0xBe31BC9278e4745d9D04F4A9113B71Db3Bdc7E43',
      pluginSubdomain: 'spp',
      isSubProposal: false,
      network: NetworksEnum.cornMainnet,
    })

    if (!proposalParent) {
      logger.error('Proposal parent not found', llo())
      return
    }

    const info = {
      transactionHash: proposalParent.transactionHash,
      blockNumber: proposalParent.blockNumber,
      network: proposalParent.pluginAddress,
      address: proposalParent.address,
    } as any

    await ProposalHandler.pairSppProposals(
      proposalParent,
      await Models.Plugin.findOne({ address: proposalParent.pluginAddress, network: proposalParent.network }),
      info,
    )

    logger.info('End fixSppPair', llo())
  },

  stop: async () => {},
}

export default FixSppPair
