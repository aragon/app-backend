import { EnumConnection, type IService } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'tool:fixSppPair' })

export const FixSppPair: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const proposalParent = await Models.Proposal.findOne({
      id: '0x4d45ad526080d4f19c6fe4b9e959118725badeba4f1b24ae2cfd34eb4cd34a48-0x5624c480df8dBaFBcF48Bc77Bc97b0d73bFD0C82-2939695941842880050678045345409644196526541492223508073742106263045851075538',
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
