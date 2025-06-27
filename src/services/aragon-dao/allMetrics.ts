import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import DBCrawler from '@models/utils/crawler'
import type Proposal from '@models/schema/proposal'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import type MemberBalance from '@models/schema/memberBalance'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { ProxyToken } from '@modules/proxyToken'

const llo = logger.logMeta.bind(null, { service: 'service:dao:DaoAssets' })

export const AllMetrics = {
  start: async ({ network }: { network: NetworksEnum }) => {
    logger.verbose('Start AllMetrics', llo())
    await AllMetrics.allDaoMetrics(network)
    await AllMetrics.allProposalMetrics(network)
    await AllMetrics.rebaseTokens(network)
    logger.verbose('End AllMetrics', llo())
  },

  allDaoMetrics: async (network?: NetworksEnum) => {
    const where = network ? { network } : {}
    const crawler = new DBCrawler({
      model: Models.Dao,
      onDocument: async (dao: Dao) => DaoMetrics.onDocument(dao),
      onError: (error: any, document: any) => {
        logger.error('Error Dao Metrics', { document, error })
      },
      where,
      batchSize: 2000,
      concurrency: 100,
    })

    await crawler.crawl()
    logger.verbose('End allDaoMetrics', llo())
  },

  allProposalMetrics: async (network?: NetworksEnum) => {
    const where = network ? { network } : {}
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
      where,
      batchSize: 2000,
      concurrency: 100,
    })

    await crawler.crawl()
    logger.verbose('End allProposalMetrics', llo())
  },

  rebaseTokens: async (network?: NetworksEnum) => {
    if (network !== NetworksEnum.ethereumSepolia) return
    // we only rebase for the token address 0x01403157c847B2c0291c05DF5055876eB4e039bc on ethereum sepolia
    const dbCrawler = new DBCrawler({
      model: Models.MemberBalance,
      onDocument: async (doc: MemberBalance) => {
        const blockNumber = doc.lastSyncVotingPowerBlockNumber || doc.lastSyncAmountBlockNumber
        const token = await ProxyToken.saveAndGetToken(doc.tokenAddress, doc.network, false)
        const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, doc.network)
        const memberVotingPower = await GovernanceErc20Helper.getPastVotes(
          doc.address,
          doc.tokenAddress,
          blockNumber,
          blockTimestamp,
          doc.network,
          token?.hasClockMode,
        )

        if (memberVotingPower !== doc.votingPower) {
          logger.error('Wrong data', llo({ doc, memberVotingPower }))
          await doc.update({ votingPower: memberVotingPower, lastSyncVotingPowerBlockNumber: blockNumber })
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error SyncMemberVP', { document, error })
      },
      where: {
        tokenAddress: '0x01403157c847B2c0291c05DF5055876eB4e039bc',
      },
      batchSize: 1,
      concurrency: 1,
    })

    await dbCrawler.crawl()
    logger.verbose('End rebaseTokens', llo())
  },
}
