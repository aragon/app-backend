import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { ProposalHandler } from '@services/indexer/handlers/proposalHandler'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'

describe('Indexer: ProposalHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('proposalCreated', () => {
    it('should proposalCreated', async () => {
      const metadataUri = 'fake-uri'
      const network = NetworksEnum.mainnet

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeEvent = {
        args: {
          creator: '0x456',
          proposalId: 2n,
          startDate: 1312312123n,
          endDate: 1312312125n,
          allowFailureMap: 1n,
          metadata: 'test',
          actions: [
            {
              to: '0x0',
              value: 1n,
              data: '0x',
            },
          ],
        },
      }

      const stubProposalMetadata = sandbox.stub(ProposalHandler, 'proposalMetadata').resolves()
      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(metadataUri)
      const stubLogger = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCreated(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubExtractMetadataUri.calledOnceWith(fakeEvent.args.metadata)).to.be.true
      expect(stubProposalMetadata.calledOnceWith(txLog)).to.be.true
    })

    it('proposalCreated throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Web3Helper, 'extractMetadataUri').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalCreated(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error proposalCreated' as any)).to.be.true
    })
  })

  describe('approved', () => {
    it('should approved', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
        executed: {
          status: true,
          transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          blockNumber: 3,
        },
      }
      await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          proposalId: 0n,
          approver: '0x0',
        },
      }

      const stubLogger = sandbox.stub(logger, 'verbose')

      await ProposalHandler.approved(fakeEvent as any, txLog, network)

      const newProposal = await Models.LogProposal.findByProposalId(
        Number(fakeEvent.args.proposalId),
        txLog.address,
        network,
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(newProposal.voteEvents[0].transactionHash).to.eq(txLog.transactionHash)
      expect(newProposal.voteEvents[0].blockNumber).to.eq(txLog.blockNumber)
      expect(newProposal.voteEvents[0].proposalId).to.eq(Number(fakeEvent.args.proposalId))
      expect(newProposal.voteEvents[0].memberAddress).to.eq(fakeEvent.args.approver)
    })

    it('approved error proposal not found', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
        executed: {
          status: true,
          transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          blockNumber: 3,
        },
      }
      await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          proposalId: 0n,
          approver: '0x0',
        },
      }

      sandbox.stub(Models.LogProposal, 'findByProposalId').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')

      const result = await ProposalHandler.approved(fakeEvent as any, txLog, network)

      expect(result).to.be.undefined

      expect(stubLogger.calledOnceWith('proposal not found' as any)).to.be.true
    })

    it('proposalCreated throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogProposal, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.approved(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error approved' as any)).to.be.true
    })
  })

  describe('voteCast', () => {
    it('should voteCast', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
      }
      await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          voter: '0x0',
          proposalId: 0n,
          voteOption: 10n,
          votingPower: 1000n,
        },
      }

      const stubLogger = sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCast(fakeEvent as any, txLog, network)

      const newProposal = await Models.LogProposal.findByProposalId(
        Number(fakeEvent.args.proposalId),
        txLog.address,
        network,
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(newProposal.voteEvents[0].transactionHash).to.eq(txLog.transactionHash)
      expect(newProposal.voteEvents[0].blockNumber).to.eq(txLog.blockNumber)
      expect(newProposal.voteEvents[0].proposalId).to.eq(Number(fakeEvent.args.proposalId))
      expect(newProposal.voteEvents[0].memberAddress).to.eq(fakeEvent.args.voter)
      expect(newProposal.voteEvents[0].voteOption).to.eq(Number(fakeEvent.args.voteOption))
      expect(newProposal.voteEvents[0].votingPower).to.eq(fakeEvent.args.votingPower.toString())
    })

    it('voteCast error proposal not found', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
      }
      await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          voter: '0x0',
          proposalId: 0n,
          voteOption: 10n,
          votingPower: 1000n,
        },
      }

      sandbox.stub(Models.LogProposal, 'findByProposalId').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')

      const result = await ProposalHandler.voteCast(fakeEvent as any, txLog, network)

      expect(result).to.be.undefined
      expect(stubLogger.calledOnceWith('proposal not found' as any)).to.be.true
    })

    it('voteCast throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogProposal, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.voteCast(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error voteCast' as any)).to.be.true
    })
  })

  describe('proposalExecuted', () => {
    it('should proposalExecuted', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
      }
      await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          proposalId: 0n,
        },
      }

      const stubLogger = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, txLog, network)

      const newProposal = await Models.LogProposal.findByProposalId(
        Number(fakeEvent.args.proposalId),
        txLog.address,
        network,
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(newProposal.executed.status).to.be.true
      expect(newProposal.executed.blockNumber).to.eq(txLog.blockNumber)
      expect(newProposal.executed.transactionHash).to.eq(txLog.transactionHash)
    })

    it('proposalExecuted error proposal not found', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          voter: '0x0',
          proposalId: 0n,
          voteOption: 10n,
          votingPower: 1000n,
        },
      }

      sandbox.stub(Models.LogProposal, 'findByProposalId').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.proposalExecuted(fakeEvent as any, txLog, network)

      expect(result).to.be.undefined
      expect(stubLogger.calledOnceWith('proposal not found' as any)).to.be.true
    })

    it('proposalExecuted throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogProposal, 'findByProposalId').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalExecuted(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error proposalExecuted' as any)).to.be.true
    })
  })

  describe('proposalMetadata', () => {
    it('should proposalMetadata', async () => {
      const network = NetworksEnum.mainnet
      const rawProposal = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network,
        pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        proposalId: 0,
        allowFailureMap: 0,
        creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        startDate: 234234223,
        endDate: 334234223,
        metadataUri: 'some-uri',
        actions: [],
        voteEvents: [],
      }
      const proposalDb = await Models.LogProposal.create(rawProposal)

      const txLog = {
        transactionHash: '0x123',
        address: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseProposalMetadata').returns(fakeMetadata)

      await ProposalHandler.proposalMetadata(txLog, proposalDb)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(proposalDb.metadataUri)
      expect(stubParseDaoMetadata.calledOnce).to.be.true
      expect(stubParseDaoMetadata.calledWith(fakeMetadata)).to.be.true

      const proposalMetadataDB = await Models.LogProposalMetadata.findExistingLog(
        proposalDb.transactionHash,
        proposalDb.pluginAddress,
        proposalDb.proposalId,
      )
      expect(proposalMetadataDB.transactionHash).to.eq(proposalDb.transactionHash)
      expect(proposalMetadataDB.blockNumber).to.eq(proposalDb.blockNumber)
      expect(proposalMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(true)
      expect(proposalMetadataDB.pluginAddress).to.eq(proposalDb.pluginAddress)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(true)
      expect(proposalMetadataDB.proposalId).to.eq(proposalDb.proposalId)
    })

    it('voteCast throw error', async () => {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      sandbox.stub(IPFSModule, 'fetchMetadata').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalMetadata(txLog, { id: 1 } as any)

      expect(stubLogger.calledOnceWith('Error proposalMetadata' as any)).to.be.true
    })
  })
})
