import { Models } from '@dbModels'
import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

const llo = logger.logMeta.bind(null, { service: 'reorgs:ProposalValidator' })

export const ProposalValidator = {
  proposalCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const entityId = Models.Proposal.getEntityId({
      transactionHash: info.transactionHash,
      pluginAddress: info.address,
      proposalIndex,
    })
    const record = await Models.Proposal.findByEntityId(entityId)
    if (!record) {
      logNotFound('ProposalCreated', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('ProposalCreated', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('ProposalCreated', info, { entityId })
  },

  approved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const entityId = Models.Vote.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    const record = await Models.Vote.findByEntityId(entityId)
    if (!record) {
      logNotFound('Approved', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('Approved', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('Approved', info, { entityId })
  },

  voteCast: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const entityId = Models.Vote.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    const record = await Models.Vote.findByEntityId(entityId)
    if (!record) {
      logNotFound('VoteCast', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('VoteCast', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('VoteCast', info, { entityId })
  },

  proposalExecuted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const record = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
    if (!record) {
      logNotFound('ProposalExecuted', info, { proposalIndex })
      return
    }
    if (record.executed?.blockNumber && record.executed.blockNumber !== info.blockNumber) {
      logMismatch('ProposalExecuted', info, {
        dbBlock: record.executed.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('ProposalExecuted', info, { proposalIndex })
  },

  proposalResultReport: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const record = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
    if (!record) {
      logNotFound('ProposalResultReported', info, { proposalIndex })
      return
    }
    const hasResult = record.results?.some(
      (r: any) => r.transactionHash === info.transactionHash && r.blockNumber === info.blockNumber,
    )
    if (!hasResult) {
      logger.error('ProposalResultReported: result entry not found for block', llo({ ...info, proposalIndex }))
      return
    }
    logValid('ProposalResultReported', info, { proposalIndex })
  },

  proposalAdvanced: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const record = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
    if (!record) {
      logNotFound('ProposalAdvanced', info, { proposalIndex })
      return
    }
    const hasExecution = record.stageExecutions?.some(
      (s: any) => s.blockNumber === info.blockNumber && s.transactionHash === info.transactionHash,
    )
    if (!hasExecution) {
      logger.error('ProposalAdvanced: stage execution not found for block', llo({ ...info, proposalIndex }))
      return
    }
    logValid('ProposalAdvanced', info, { proposalIndex })
  },

  proposalCanceled: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const record = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
    if (!record) {
      logNotFound('ProposalCanceled', info, { proposalIndex })
      return
    }
    if (record.cancelTxInfo?.blockNumber && record.cancelTxInfo.blockNumber !== info.blockNumber) {
      logMismatch('ProposalCanceled', info, {
        dbBlock: record.cancelTxInfo.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('ProposalCanceled', info, { proposalIndex })
  },

  proposalEdited: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const record = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
    if (!record) {
      logNotFound('ProposalEdited', info, { proposalIndex })
      return
    }
    if (record.editedTxInfo?.blockNumber && record.editedTxInfo.blockNumber !== info.blockNumber) {
      logMismatch('ProposalEdited', info, {
        dbBlock: record.editedTxInfo.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('ProposalEdited', info, { proposalIndex })
  },

  voteCleared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const voter = parsedEvent.args.voter
    const record = await Models.Vote.findOne({
      proposalIndex,
      pluginAddress: info.address,
      network: info.network,
      memberAddress: voter,
    })
    if (!record) {
      logNotFound('VoteCleared', info, { proposalIndex, voter })
      return
    }
    if (record.voteCleared?.blockNumber && record.voteCleared.blockNumber !== info.blockNumber) {
      logMismatch('VoteCleared', info, {
        dbBlock: record.voteCleared.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('VoteCleared', info, { proposalIndex, voter })
  },
}
