import { type HexAddress, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Dao from '@models/schema/dao'
import type { SaveOptions } from 'mongoose'

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
        const [tvlUSD, proposalsCreated, proposalsExecuted, members, votes, uniqueVoters] = await Promise.all([
          DaoMetrics.getDaoTvl(document, { session }),
          Models.Proposal.countDocuments({ daoAddress: document.address, network: document.network }, { session }),
          Models.Proposal.countDocuments(
            {
              daoAddress: document.address,
              network: document.network,
              'executed.status': true,
            },
            { session },
          ),
          Models.DaoMemberMapping.countUniqueMembers(document.address, document.network, { session }),
          Models.Vote.countDocuments({ daoAddress: document.address, network: document.network }, { session }),
          DaoMetrics.countUniqueMemberVotesByPlugin(document.address, { session }),
        ])

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
      logger.error('Error DaoMetrics', llo({ error }))
    }
  },

  countUniqueMemberVotesByPlugin: async (daoAddress: HexAddress, tOpts?: SaveOptions) => {
    const aggregate = Models.Vote.aggregate([
      {
        $match: { daoAddress },
      },
      {
        $group: {
          _id: {
            memberAddress: '$memberAddress',
            pluginAddress: '$pluginAddress',
          },
        },
      },
      {
        $group: {
          _id: null,
          uniqueVotes: { $sum: 1 },
        },
      },
    ])

    if (tOpts?.session) {
      aggregate.session(tOpts.session)
    }

    const results = await aggregate
    return results.length > 0 ? results[0].uniqueVotes : 0
  },

  getDaoTvl: async (document: Dao, tOpts?: SaveOptions): Promise<number> => {
    const response = await Models.Asset.getDaoTvl(document.address, document.network, tOpts)
    return Number(response?.tvlUsd || 0)
  },
}
