import { Models } from '@dbModels'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import SafeRelationsModule from '@modules/safe/safeRelations'
import { type HexAddress, type NetworksEnum } from '@types'

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
      // Safe owners count only through the relation. A failed resolution keeps the stored member
      // count instead of publishing one that is missing the Safes.
      let safeAddresses: HexAddress[] | null = null
      try {
        safeAddresses = await SafeRelationsModule.getSafeAddresses(document.address, document.network)
      } catch (error) {
        logger.warn(
          'Unable to resolve Safe relations for DAO metrics',
          llo({ daoAddress: document.address, network: document.network, error }),
        )
      }

      // Run all metric calculations in parallel without transaction
      const [tvlUSD, proposalsCreated, proposalsExecuted, members, votes, uniqueVoters] = await Promise.all([
        Models.Asset.getDaoTvl(document.address, document.network),
        Models.Proposal.countDocuments({
          daoAddress: document.address,
          network: document.network,
          isSubProposal: false,
        }),
        Models.Proposal.countDocuments({
          daoAddress: document.address,
          network: document.network,
          isSubProposal: false,
          'executed.status': true,
        }),
        safeAddresses ? Models.Dao.countUniqueMembers(document.address, document.network, safeAddresses) : undefined,
        Models.Vote.countDocuments({
          daoAddress: document.address,
          network: document.network,
        }),
        Models.Vote.countUniqueMemberVotesByPlugin(document.address),
      ])

      // Update metrics atomically
      const logDb = await document.updateMetrics({
        tvlUSD,
        uniqueVoters,
        proposalsCreated,
        proposalsExecuted,
        votes,
        members,
      })

      logger.verbose('Update Dao metrics', llo({ logId: logDb?.id }))
    } catch (error) {
      logger.error('Error DaoMetrics', llo({ error, daoAddress: document.address, network: document.network }))
    }
  },
}
