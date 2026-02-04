import { Models } from '@dbModels'
import logger from '@logger'
import { logCumulative, logOrphan } from '@services/aragon-reorgs/validators/baseValidator'
import { ProposalValidator } from '@services/aragon-reorgs/validators/proposalValidator'
import { ProposalList } from '@test/mock/fakeProposal'
import { NetworksEnum, type ILogInfo } from '@types'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Validator: ProposalValidator', () => {
  let sandbox: SinonSandbox
  const network = NetworksEnum.polygonMainnet

  const baseInfo: ILogInfo = {
    network,
    blockNumber: 100,
    transactionIndex: 0,
    logIndex: 0,
    transactionHash: '0xabc123',
    address: '0xPluginAddress',
    eventName: 'ProposalCreated',
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('proposalCreated', () => {
    it('should log valid when proposal exists with matching blockNumber', async () => {
      const proposal = { ...ProposalList[0], network, blockNumber: 100 }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any

      const info = {
        ...baseInfo,
        transactionHash: created.transactionHash,
        address: created.pluginAddress,
      }

      await ProposalValidator.proposalCreated(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalCreated: valid')
    })

    it('should log error when proposal not found', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => '999' } } } as any

      await ProposalValidator.proposalCreated(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalCreated: record not found')
    })

    it('should log mismatch when blockNumber differs', async () => {
      const proposal = { ...ProposalList[0], network, blockNumber: 200 }
      const created = await Models.Proposal.create(proposal)
      const errorSpy = sandbox.spy(logger, 'error')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any

      const info = {
        ...baseInfo,
        blockNumber: 100,
        transactionHash: created.transactionHash,
        address: created.pluginAddress,
      }

      await ProposalValidator.proposalCreated(parsedEvent, info)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalCreated: blockNumber mismatch')
    })
  })

  describe('approved', () => {
    it('should log error when vote not found', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: {} } as any

      await ProposalValidator.approved(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('Approved: record not found')
    })
  })

  describe('voteCast', () => {
    it('should log error when vote not found', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: {} } as any

      await ProposalValidator.voteCast(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('VoteCast: record not found')
    })
  })

  describe('proposalExecuted', () => {
    it('should log valid when proposal found with matching executed.blockNumber', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        executed: { status: true, blockNumber: 100, transactionHash: '0xabc123', blockTimestamp: 1234 },
      }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any

      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalExecuted(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalExecuted: valid')
    })

    it('should log mismatch when executed.blockNumber differs', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        executed: { status: true, blockNumber: 200, transactionHash: '0xother', blockTimestamp: 1234 },
      }
      const created = await Models.Proposal.create(proposal)
      const errorSpy = sandbox.spy(logger, 'error')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any

      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalExecuted(parsedEvent, info)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalExecuted: blockNumber mismatch')
    })

    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalExecuted(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalExecuted: record not found')
    })
  })

  describe('proposalCanceled', () => {
    it('should log valid when proposal exists and cancelTxInfo has no mismatch', async () => {
      const proposal = { ...ProposalList[0], network, blockNumber: 50 }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalCanceled(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalCanceled: valid')
    })

    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalCanceled(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalCanceled: record not found')
    })
  })

  describe('proposalEdited', () => {
    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalEdited(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalEdited: record not found')
    })
  })

  describe('proposalResultReport', () => {
    it('should log valid when result entry exists', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        results: [
          { transactionHash: '0xabc123', blockNumber: 100, stage: 0, resultType: 1, pluginAddress: '0xPluginAddress' },
        ],
      }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalResultReport(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalResultReported: valid')
    })

    it('should log error when result entry not found for block', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        results: [
          { transactionHash: '0xother', blockNumber: 999, stage: 0, resultType: 1, pluginAddress: '0xPluginAddress' },
        ],
      }
      const created = await Models.Proposal.create(proposal)
      const errorSpy = sandbox.spy(logger, 'error')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalResultReport(parsedEvent, info)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalResultReported: result entry not found')
    })

    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalResultReport(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalResultReported: record not found')
    })
  })

  describe('proposalAdvanced', () => {
    it('should log valid when stage execution exists', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        stageExecutions: [{ blockNumber: 100, transactionHash: '0xabc123' }],
      }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalAdvanced(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalAdvanced: valid')
    })

    it('should log error when stage execution not found for block', async () => {
      const proposal = {
        ...ProposalList[0],
        network,
        blockNumber: 50,
        stageExecutions: [{ blockNumber: 999, transactionHash: '0xother' }],
      }
      const created = await Models.Proposal.create(proposal)
      const errorSpy = sandbox.spy(logger, 'error')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalAdvanced(parsedEvent, info)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalAdvanced: stage execution not found')
    })

    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalAdvanced(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalAdvanced: record not found')
    })
  })

  describe('proposalEdited', () => {
    it('should log valid when proposal exists and editedTxInfo has no mismatch', async () => {
      const proposal = { ...ProposalList[0], network, blockNumber: 50 }
      const created = await Models.Proposal.create(proposal)
      const verboseSpy = sandbox.spy(logger, 'verbose')

      const parsedEvent = { args: { proposalId: { toString: () => created.proposalIndex } } } as any
      const info = { ...baseInfo, address: created.pluginAddress }

      await ProposalValidator.proposalEdited(parsedEvent, info)
      expect(verboseSpy.calledOnce).to.be.true
      expect(verboseSpy.firstCall.args[0]).to.include('ProposalEdited: valid')
    })

    it('should log not found when proposal does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => 'nonexistent' } } } as any

      await ProposalValidator.proposalEdited(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('ProposalEdited: record not found')
    })
  })

  describe('voteCleared', () => {
    it('should log not found when vote does not exist', async () => {
      const errorSpy = sandbox.spy(logger, 'error')
      const parsedEvent = { args: { proposalId: { toString: () => '1' }, voter: '0xVoter' } } as any

      await ProposalValidator.voteCleared(parsedEvent, baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('VoteCleared: record not found')
    })
  })

  describe('baseValidator utilities', () => {
    it('should log cumulative event', () => {
      const errorSpy = sandbox.spy(logger, 'error')
      logCumulative('MembersAdded', baseInfo)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('MembersAdded: cumulative event in reorged block')
    })

    it('should log orphan record', () => {
      const errorSpy = sandbox.spy(logger, 'error')
      logOrphan('Proposal', network, 'entity-123', 100)
      expect(errorSpy.calledOnce).to.be.true
      expect(errorSpy.firstCall.args[0]).to.include('Orphan Proposal detected')
    })
  })
})
