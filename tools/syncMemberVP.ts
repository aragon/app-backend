import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type TokenMember from '@models/schema/tokenMember'
import DBCrawler from '@models/utils/crawler'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: SyncMemberVP' })
// 67.5k
export const SyncMemberVP: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    let countWrongData = 0
    const dbCrawler = new DBCrawler({
      model: Models.MemberBalance,
      onDocument: async (doc: TokenMember) => {
        const blockNumber = doc.lastVPBlockNumber
        const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, doc.network)
        const token = await Models.Token.findOne({
          address: doc.tokenAddress,
          network: doc.network,
        })
        const memberVotingPower = await GovernanceErc20Helper.getPastVotes(
          doc.address,
          doc.tokenAddress,
          blockNumber,
          blockTimestamp,
          doc.network,
          token.clockMode,
        )

        if (memberVotingPower !== doc.votingPower) {
          countWrongData++
          logger.error('Wrong data', llo({ doc, memberVotingPower }))

          await doc.update({ votingPower: memberVotingPower, lastSyncVotingPowerBlockNumber: blockNumber })
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error SyncMemberVP', { document, error })
      },
      where: {
        votingPower: '0',
        address: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
        tokenAddress: '0x01403157c847B2c0291c05DF5055876eB4e039bc',
      },
      batchSize: 500,
      concurrency: 10,
    })

    await dbCrawler.crawl()

    logger.info('Total wrong data fixed', llo({ countWrongData }))

    logger.info('END', llo())
  },

  stop: async () => {},
}

export default SyncMemberVP
