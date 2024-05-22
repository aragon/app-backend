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
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
      const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)
      const proposalId = Number(parsedEvent.args.proposalId)
      const pluginAddress = txLog.address
      const existingLog = await Models.LogProposal.findExistingLog(txLog.transactionHash, pluginAddress, proposalId)

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const proposalLog = {
            network,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
            pluginAddress,
            creatorAddress: parsedEvent.args.creator,
            proposalId,
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

          const logDb = await Models.LogProposal.create(proposalLog, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New Proposal', llo({ logId: logDb.id, logInfo }))

          await ProposalHandler.proposalMetadata(txLog, logDb)
        })
      }
    } catch (error) {
      logger.error('Error proposalCreated', llo({ logInfo, error }))
    }
  },

  approved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
      const parsedParams = {
        blockNumber: txLog.blockNumber,
        transactionHash: txLog.transactionHash,
        proposalId: Number(parsedEvent.args.proposalId),
        memberAddress: parsedEvent.args.approver,
      }
      const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, txLog.address, network)

      if (!proposal) {
        logger.error('proposal not found', llo({ logInfo }))
        return
      }

      const existingVote = await proposal.findVote(txLog.transactionHash)

      if (!existingVote) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.addVoteEvent(parsedParams, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New approved', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error approved', llo({ logInfo, error }))
    }
  },

  voteCast: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
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
        logger.error('proposal not found', llo({ logInfo }))
        return
      }

      const existingVote = await proposal.findVote(txLog.transactionHash)

      if (!existingVote) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.addVoteEvent(parsedParams, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New voteCast', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error voteCast', llo({ logInfo, error }))
    }
  },

  proposalExecuted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
      const parsedParams = {
        proposalId: Number(parsedEvent.args.proposalId),
      }
      const proposal = await Models.LogProposal.findByProposalId(parsedParams.proposalId, txLog.address, network)

      if (!proposal) {
        logger.error('proposal not found', llo({ logInfo }))
        return
      }

      if (!proposal.executed) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await proposal.update({
            executed: {
              status: true,
              blockNumber: txLog.blockNumber,
              transactionHash: txLog.transactionHash,
            },
          })
          logger.verbose('New proposalExecuted', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error proposalExecuted', llo({ logInfo, error }))
    }
  },

  proposalMetadata: async (txLog: any, proposalDb: LogProposal) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network: proposalDb.network,
      proposalId: proposalDb.id,
      metadataUri: proposalDb.metadataUri,
    }

    try {
      const ipfsMetadata = await IPFSModule.fetchMetadata(proposalDb.metadataUri, { retries: 1 })
      const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)
      const existingProposalMetadata = await Models.LogProposalMetadata.findExistingLog(
        proposalDb.transactionHash,
        proposalDb.pluginAddress,
        proposalDb.proposalId,
      )

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
          const logDb = await Models.LogProposalMetadata.create(logProposalMetadata, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New proposalMetadata', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error proposalMetadata', llo({ logInfo, error }))
    }
  },
}
