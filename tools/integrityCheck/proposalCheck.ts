import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import Utils from '@helpers/utils'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import IntegrityUtil from '@tools/integrityCheck/graphUtil'
import { EnumConnection, IPluginInterfaceType, IPluginStatus } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:IntegrityToolProposalCheck' })
export const IntegrityToolProposalCheck: any = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  BAD_VOTE_PROPOSAL: [],
  BAD_PROPOSAL_PLUGIN: [],
  MISSING_SLUG: [],
  ERROR_PROPOSAL_PLUGIN: [],
  start: async () => {
    const networks = NetworkHelper.supportedNetworks()
    await Promise.all(
      networks.map(async ({ networkName }) => {
        const dbCrawler = new DBCrawler({
          model: Models.Plugin,
          where: {
            network: networkName,
            status: IPluginStatus.installed,
          },
          onDocument: IntegrityToolProposalCheck.onDocument,
          onError: (_error: any, document: any) => {
            IntegrityToolProposalCheck.ERROR_PROPOSAL_PLUGIN.push({
              network: document.network,
              address: document.address,
            })
            logger.error('IntegrityToolProposalCheck error', { document: document.address })
          },
          batchSize: 50,
          concurrency: 5,
        })

        await dbCrawler.crawl()
      }),
    )

    logger.info(
      'IntegrityToolProposalCheck finished',
      llo({
        BAD_VOTE_PROPOSAL: IntegrityToolProposalCheck.BAD_VOTE_PROPOSAL,
        BAD_PROPOSAL_PLUGIN: IntegrityToolProposalCheck.BAD_PROPOSAL_PLUGIN,
        ERROR_PROPOSAL_PLUGIN: IntegrityToolProposalCheck.ERROR_PROPOSAL_PLUGIN,
        MISSING_SLUG: IntegrityToolProposalCheck.MISSING_SLUG,
      }),
    )
  },

  handleResult: async (plugin: any, type: any, graphCount: number, dbCount: number) => {
    if (graphCount !== dbCount) {
      IntegrityToolProposalCheck.BAD_PROPOSAL_PLUGIN.push({
        network: plugin.network,
        type,
        address: plugin.address,
      })
      logger.error(`❌ ${type} mismatch for ${plugin.address}`, llo({ graphCount, dbCount }))
    } else {
      logger.info(`✅ ${type} match for ${plugin.address}`, llo({ graphCount, dbCount }))
    }

    const dbProposals = await Models.Proposal.find({
      pluginAddress: plugin.address,
      network: plugin.network,
    })

    const proposalIds = dbProposals.map((proposal: any) => Number(proposal.proposalIndex))

    for (const proposal of proposalIds) {
      await Utils.wait(100)
      if (type === 'multisig') {
        const graphResult = await IntegrityUtil.getMultisigProposalInfoFromGraph(
          plugin.network,
          plugin.address,
          proposal,
        )
        const graphProposalVotes = graphResult.data.data.multisigProposal.approvals
        const dbProposalVotes = await Models.Vote.countDocuments({
          proposalIndex: `${proposal}`,
          pluginAddress: plugin.address,
          network: plugin.network,
        })

        if (graphProposalVotes.length !== dbProposalVotes) {
          IntegrityToolProposalCheck.BAD_VOTE_PROPOSAL.push({
            network: plugin.network,
            plugin: plugin.address,
            proposalIndex: proposal,
          })
          logger.error(`❌ Proposal votes mismatch for ${plugin.address} and proposal ${proposal}`)
        } else {
          logger.info(`✅ Proposal votes match for ${plugin.address} and proposal ${proposal}`)
        }

        continue
      }

      const graphResult = await IntegrityUtil.getTokenVotingProposalInfoFromGraph(
        plugin.network,
        plugin.address,
        proposal,
      )
      const graphProposalVotes = graphResult.data.data.tokenVotingProposal.voters
      const dbProposalVotes = await Models.Vote.countDocuments({
        proposalIndex: `${proposal}`,
        pluginAddress: plugin.address,
        network: plugin.network,
      })

      if (graphProposalVotes.length !== dbProposalVotes) {
        logger.error(`❌ Proposal votes mismatch for ${plugin.address} and proposal ${proposal}`)
        IntegrityToolProposalCheck.BAD_VOTE_PROPOSAL.push({
          network: plugin.network,
          plugin: plugin.address,
          proposalIndex: proposal,
        })
      } else {
        logger.info(`✅ Proposal votes match for ${plugin.address} and proposal ${proposal}`)
      }
    }
  },

  checkForMultisig: async (plugin: any) => {
    const graphResult = await IntegrityUtil.getProposalCountForMultisigVoting(plugin.network, plugin.address)
    const graphProposalCount = graphResult.data.data.multisigPlugin.proposalCount
    const dbProposalCount = await Models.Proposal.countDocuments({
      pluginAddress: plugin.address,
      network: plugin.network,
    })

    // check if plugin as slug
    if (plugin.isSupported) {
      const slug = await Models.PluginSlug.findOne({ pluginAddress: plugin.address, network: plugin.network })
      if (!slug) {
        IntegrityToolProposalCheck.MISSING_SLUG.push({
          network: plugin.network,
          type: 'slug',
          address: plugin.address,
        })
        logger.error(
          `❌ slug mismatch for ${plugin.address}`,
          llo({ address: plugin.address, network: plugin.network }),
        )
      } else {
        logger.info(`✅ slug match for ${plugin.address}`, llo({ address: plugin.address, network: plugin.network }))
      }
    }

    await IntegrityToolProposalCheck.handleResult(
      plugin,
      'multisig',
      Number(graphProposalCount),
      Number(dbProposalCount),
    )
  },

  checkForTokenVoting: async (plugin: any) => {
    const graphResult = await IntegrityUtil.getProposalCountForTokenVoting(plugin.network, plugin.address)
    const graphProposalCount = graphResult.data.data.tokenVotingPlugin.proposalCount
    const dbProposalCount = await Models.Proposal.countDocuments({
      pluginAddress: plugin.address,
      network: plugin.network,
    })

    // check if plugin as slug
    if (plugin.isSupported) {
      const slug = await Models.PluginSlug.findOne({ pluginAddress: plugin.address, network: plugin.network })
      if (!slug) {
        IntegrityToolProposalCheck.MISSING_SLUG.push({
          network: plugin.network,
          type: 'slug',
          address: plugin.address,
        })
        logger.error(
          `❌ slug mismatch for ${plugin.address}`,
          llo({ address: plugin.address, network: plugin.network }),
        )
      } else {
        logger.info(`✅ slug match for ${plugin.address}`, llo({ address: plugin.address, network: plugin.network }))
      }
    }

    await IntegrityToolProposalCheck.handleResult(
      plugin,
      'tokenVoting',
      Number(graphProposalCount),
      Number(dbProposalCount),
    )
  },

  onDocument: async (plugin: any) => {
    await Utils.wait(100)

    switch (plugin.interfaceType) {
      case IPluginInterfaceType.multisig:
        await IntegrityToolProposalCheck.checkForMultisig(plugin)
        break
      case IPluginInterfaceType.tokenVoting:
        await IntegrityToolProposalCheck.checkForTokenVoting(plugin)
        break
      default:
    }
  },

  stop: async () => {},
}

export default IntegrityToolProposalCheck
