import { EnumConnection, IPluginInterfaceType, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import type Proposal from '@models/schema/proposal'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'

export const RefetchProposalsMetrics: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const crawler = new DBCrawler({
      model: Models.Proposal,
      onDocument: async (proposal: Proposal) => {
        const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, proposal.network)
        if (!plugin.isSupported) return
        if (plugin.interfaceType === IPluginInterfaceType.tokenVoting) {
          await ProposalMetrics.proposalTokenVotingMetrics({
            pluginAddress: proposal.pluginAddress,
            proposalIndex: proposal.proposalIndex,
            network: proposal.network,
          })
        } else if (plugin.interfaceType === IPluginInterfaceType.multisig) {
          await ProposalMetrics.proposalMultisigMetrics({
            pluginAddress: proposal.pluginAddress,
            proposalIndex: proposal.proposalIndex,
            network: proposal.network,
          })
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error RefetchProposalsMetrics', { document, error })
      },
      where: {
        // daoAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
        // pluginAddress: '0x0673c13D48023efA609C20E5E351763B99Dd67DE',
        // proposalIndex: '1',
      },
      batchSize: 2000,
      concurrency: 100,
    })

    await crawler.crawl()
    logger.info('proposals metrics refetch end')
  },

  stop: async () => {},
}

export default RefetchProposalsMetrics
