import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import IPFSModule from '@modules/ipfs'
import type LogProposal from '@models/schema/logProposal'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:ProposalHandler' })

export const ProposalHandler = {
  proposalCreated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('proposalCreated', llo({ parsedEvent }))

    const existingLog = await Models.LogProposal.findTxHash(txLog.transactionHash)
    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const proposalLog = {
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          pluginAddress: txLog.address,
          creatorAddress: parsedEvent.args.creator,
          proposalId: Number(parsedEvent.args.proposalId),
          startDate: Number(parsedEvent.args.startDate),
          endDate: Number(parsedEvent.args.endDate),
          allowFailureMap: Number(parsedEvent.args.allowFailureMap),
          metadataUri,
          actions: parsedEvent.args?.actions.map((w: any) => ({
            to: w.to,
            value: Number(w.value || 0),
            data: w.data,
          })),
        }

        const proposalDb = await Models.LogProposal.create(proposalLog, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New ProposalLog', llo({ proposalLog }))

        await ProposalHandler.proposalMetadata(txLog, proposalDb)
      })
    }
  },

  approved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('approved', llo({ parsedEvent }))

    const parsedParams = {
      blockNumber: txLog.blockNumber,
      transactionHash: txLog.transactionHash,
      proposalId: Number(parsedEvent.args.proposalId),
      memberAddress: parsedEvent.args.approver,
    }
    const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, txLog.address, network)

    if (!proposal) {
      logger.error('proposal not found', llo({ parsedEvent, txLog }))
      return
    }

    const existingVote = await proposal.findVote(txLog.transactionHash)

    if (!existingVote) {
      await DbTx.executeTxFn(async ({ session }) => {
        await proposal.addVoteEvent(parsedParams, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New approvedLog', llo({ parsedParams }))
      })
    }
  },

  voteCast: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('voteCast', llo({ parsedEvent }))

    const parsedParams = {
      blockNumber: txLog.blockNumber,
      transactionHash: txLog.transactionHash,
      proposalId: Number(parsedEvent.args.proposalId),
      voteOption: Number(parsedEvent.args.voteOption),
      votingPower: Number(parsedEvent.args.votingPower),
      memberAddress: parsedEvent.args.voter,
    }
    const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, txLog.address, network)

    if (!proposal) {
      logger.error('proposal not found', llo({ parsedEvent, txLog }))
      return
    }

    const existingVote = await proposal.findVote(txLog.transactionHash)

    if (!existingVote) {
      await DbTx.executeTxFn(async ({ session }) => {
        await proposal.addVoteEvent(parsedParams, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New voteCastLog', llo({ parsedParams }))
      })
    }
  },

  proposalExecuted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('proposalExecuted', llo({ parsedEvent }))

    const parsedParams = {
      proposalId: Number(parsedEvent.args.proposalId),
    }
    const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, txLog.address, network)

    if (!proposal) {
      logger.error('proposal not found', llo({ parsedEvent, txLog }))
      return
    }

    if (!proposal.executed) {
      await DbTx.executeTxFn(async ({ session }) => {
        await proposal.update({
          executed: {
            status: true,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          },
        })
        logger.verbose('New proposalExecutedLog', llo({ parsedParams }))
      })
    }
  },

  proposalMetadata: async (txLog: any, proposalDb: LogProposal) => {
    logger.verbose('proposalMetadata', llo({ txLog, proposalId: proposalDb.id, metadataUri: proposalDb.metadataUri }))

    const ipfsMetadata = await IPFSModule.fetchMetadata(proposalDb.metadataUri, { retries: 1 })
    const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)

    const existingProposalMetadata = await Models.LogProposalMetadata.findTxHash(txLog.transactionHash)

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
        await Models.LogProposalMetadata.create(logProposalMetadata, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Stored proposal metadata',
          llo({
            network: proposalDb.network,
            logProposalMetadata,
          }),
        )
      })
    }
  },
}
