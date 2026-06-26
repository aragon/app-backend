import { Models } from '@dbModels'
import logger from '@logger'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillNestedActionDecoding' })

const MIGRATION = '20260528150801-backfillNestedActionDecoding'

/**
 * 4-byte selectors of functions that carry a nested `IDAO.Action[]`.
 * Deliberately excludes SPP `execute(uint256)` (0xfe0d94c1) — that executes a proposal by id
 * and has no nested actions.
 */
const NESTED_ACTION_SELECTORS = [
  '0xc71bf324', // execute(bytes32,(address,uint256,bytes)[],uint256)
  '0xfbd56e41', // createProposal(bytes,(address,uint256,bytes)[],uint256,bool,bool,uint64,uint64)  — Multisig
  '0x9cba3021', // createProposal(bytes,(address,uint256,bytes)[],uint256,uint64,uint64,uint8,bool) — TokenVoting / AddresslistVoting
  '0x35ade049', // createProposal(bytes,(address,uint256,bytes)[],uint128,uint64,bytes[][])         — StagedProposalProcessor
  '0xea65ab82', // createProposal(bytes,(address,uint256,bytes)[],uint64,uint64,bytes)              — StagedProposalProcessor
]

const SELECTOR_REGEX = `^(${NESTED_ACTION_SELECTORS.join('|')})`

export const backfillNestedActionDecodingMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      // Proposals whose raw action calldata begins with an `execute` / `createProposal` selector
      // — re-decoded so the nested `IDAO.Action[]` hierarchy and `inputData.proposalMetadata`
      // get populated.
      const proposals = await Models.Proposal.find({
        rawActions: {
          $elemMatch: {
            data: { $regex: SELECTOR_REGEX },
          },
        },
      })

      logger.info(
        `Found ${proposals.length} proposals with execute/createProposal actions`,
        llo({ count: proposals.length }),
      )

      if (proposals.length === 0) {
        logger.info('No proposals to migrate', llo({}))
        return
      }

      let processedCount = 0
      for (const proposal of proposals) {
        await ProposalHandler.parseActions(proposal)
        processedCount++
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, processedProposals: processedCount }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default backfillNestedActionDecodingMigration
