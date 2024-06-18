import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import IPFSModule from '@modules/ipfs'
import type LogProposal from '@models/schema/logProposal'
import { type Vote } from '@models/schema/logProposal'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:ProposalHandler' })

export const ProposalHandler = {
  proposalCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)!
      const proposalId = Number(parsedEvent.args.proposalId)
      const pluginAddress = info.address
      const existingLog = await Models.LogProposal.findExistingLog({
        transactionHash: info.transactionHash,
        pluginAddress,
        proposalId,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const proposalLog = {
            network: info.network,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            pluginAddress,
            creatorAddress: parsedEvent.args.creator,
            proposalId,
            startDate: Number(parsedEvent.args.startDate),
            endDate: Number(parsedEvent.args.endDate),
            allowFailureMap: Number(parsedEvent.args.allowFailureMap),
            metadataUri,
            actions: parsedEvent.args?.actions.map((w: any) => ({
              to: w.to,
              value: w.value,
              data: w.data,
            })),
          }

          const logDb = await Models.LogProposal.create(proposalLog, { session } as any)
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New Proposal', llo({ ...info, logId: logDb.id }))

          await ProposalHandler.proposalMetadata(info, logDb)
        })
      }
    } catch (error) {
      logger.error('Error proposalCreated', llo({ ...info, error }))
    }
  },

  approved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const parsedParams: Vote = {
        blockNumber: info.blockNumber,
        transactionHash: info.transactionHash,
        proposalId: Number(parsedEvent.args.proposalId),
        memberAddress: parsedEvent.args.approver,
      }
      const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, info.address, info.network)

      if (!proposal) {
        logger.error('proposal not found', llo({ ...info, parsedEvent }))
        return
      }

      const existingVote = await proposal.findVote(info.transactionHash)

      if (!existingVote) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.addVoteEvent(parsedParams, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New approved', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error approved', llo({ ...info, error }))
    }
  },

  voteCast: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const parsedParams: Vote = {
        blockNumber: info.blockNumber,
        transactionHash: info.transactionHash,
        proposalId: Number(parsedEvent.args.proposalId),
        voteOption: Number(parsedEvent.args.voteOption),
        votingPower: parsedEvent.args.votingPower,
        memberAddress: parsedEvent.args.voter,
      }
      const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, info.address, info.network)

      if (!proposal) {
        logger.error('proposal not found', llo({ ...info, parsedEvent }))
        return
      }

      const existingVote = await proposal.findVote(info.transactionHash)

      if (!existingVote) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.addVoteEvent(parsedParams, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New voteCast', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error voteCast', llo({ ...info, error }))
    }
  },

  proposalExecuted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const parsedParams = {
        proposalId: Number(parsedEvent.args.proposalId),
      }
      const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, info.address, info.network)
      if (!proposal) {
        logger.warn('proposal not found', llo({ ...info, parsedEvent }))
        return
      }

      if (!proposal.executed) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.update(
            {
              executed: {
                status: true,
                blockNumber: info.blockNumber,
                transactionHash: info.transactionHash,
              },
            },
            { session },
          )

          await session.commitTransaction()
          await session.endSession()

          logger.verbose('New proposalExecuted', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error proposalExecuted', llo({ ...info, error }))
    }
  },

  proposalMetadata: async (info: ILogInfo, proposalDb: LogProposal) => {
    const logInfo: any = {
      ...info,
      proposalId: proposalDb.id,
      metadataUri: proposalDb.metadataUri,
    }

    try {
      const ipfsMetadata = await IPFSModule.fetchMetadata(proposalDb.metadataUri, { retries: 1 })
      const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)
      const existingProposalMetadata = await Models.LogProposalMetadata.findExistingLog({
        transactionHash: proposalDb.transactionHash,
        pluginAddress: proposalDb.pluginAddress,
        proposalId: proposalDb.proposalId,
      })

      if (!existingProposalMetadata) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logProposalMetadata = {
            ...proposalMetadata,
            network: proposalDb.network,
            metadataUri: proposalDb.metadataUri,
            pluginAddress: proposalDb.pluginAddress,
            fetchedMetadata: !!ipfsMetadata,
            proposalId: proposalDb.proposalId,
            transactionHash: proposalDb.transactionHash,
            blockNumber: proposalDb.blockNumber,
          }
          const logDb = await Models.LogProposalMetadata.create(logProposalMetadata as any, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New proposalMetadata', llo({ ...logInfo, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error proposalMetadata', llo({ ...logInfo, error }))
    }
  },
}
