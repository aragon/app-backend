import { EnumConnection, type IService, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import ProviderModule from '@modules/provider'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'Tools' })

export const SyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const proposals = await Models.Proposal.find({
      daoAddress: '0x8112b792C31d94C186e7e3Ad2c35b07534084ce2',
      network: NetworksEnum.cornMainnet,
    })

    logger.info(`Found ${proposals.length} proposals with rawActions`, llo({ proposals: proposals.length }))
    let counter = 0
    for (const proposal of proposals) {
      counter++
      await ProposalHandler.parseActions(proposal)
      logger.info(`Processed ${counter} proposals`, llo({ counter, remaining: proposals.length - counter }))
    }
  },

  stop: async () => {},
}

export default SyncProposalAction
