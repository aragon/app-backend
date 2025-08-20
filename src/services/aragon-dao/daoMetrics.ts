import { type HexAddress, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Dao from '@models/schema/dao'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoMetrics' })

export const DaoMetrics = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    const startTime = Date.now()
    logger.verbose('Start DaoMetrics', llo({ startTime }))

    const daoDb = await Models.Dao.findByAddress(daoAddress, network)
    if (!daoDb) return
    await DaoMetrics.onDocument(daoDb)

    const duration = Date.now() - startTime
    logger.verbose('End DaoMetrics', llo({ daoId: daoDb.id, duration: `${duration}ms` }))
  },

  onDocument: async (document: Dao) => {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const tvlUSD = await Models.Asset.getDaoTvl(document.address, document.network, { session })
        const proposalsCreated = await Models.Proposal.countDocuments(
          {
            daoAddress: document.address,
            network: document.network,
            isSubProposal: false,
          },
          { session },
        )
        const proposalsExecuted = await Models.Proposal.countDocuments(
          {
            daoAddress: document.address,
            network: document.network,
            isSubProposal: false,
            'executed.status': true,
          },
          { session },
        )
        const members = await Models.PluginMember.countUniqueMembers(document.address, document.network, {
          session,
        })
        const votes = await Models.Vote.countDocuments(
          {
            daoAddress: document.address,
            network: document.network,
          },
          { session },
        )
        const uniqueVoters = await Models.Vote.countUniqueMemberVotesByPlugin(document.address, { session })

        const logDb = await document.updateMetrics(
          {
            tvlUSD,
            uniqueVoters,
            proposalsCreated,
            proposalsExecuted,
            votes,
            members,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Dao metrics', llo({ logId: logDb?.id }))
      })
    } catch (error) {
      logger.error('Error DaoMetrics', llo({ error, daoAddress: document.address, network: document.network }))
    }
  },
}
