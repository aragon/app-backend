import { Models } from '@dbModels'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { EnumConnection, type IService, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools' })

export const SyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const proposals = await Models.Proposal.find({
      network: { $in: [NetworksEnum.zksyncMainnet, NetworksEnum.ethereumMainnet] },
      $or: [{ 'actions.inputData.contract': { $regex: ':' } }, { 'actions.inputData.proxyName': { $regex: ':' } }],
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
