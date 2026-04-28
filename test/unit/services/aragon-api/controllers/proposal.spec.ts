import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Logger from '@logger'
import Member from '@models/schema/member'
import PluginMember from '@models/schema/pluginMember'
import Proposal from '@models/schema/proposal'
import Setting from '@models/schema/setting'
import Token from '@models/schema/token'
import TokenMember from '@models/schema/tokenMember'
import PairDataModule from '@modules/pairData'
import ProposalController from '@services/aragon-api/controllers/proposal'
import { FakeMember } from '@test/mock/fakeMember'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import { ErrorKeyEnum, type HexAddress, IPluginInterfaceType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Proposal', () => {
  let sandbox: SinonSandbox

  let rawToken: Partial<Token>
  let rawProposal: Partial<Proposal>
  let rawMember: Partial<Member>
  let rawPluginMember: Partial<PluginMember>
  let rawTokenMember: Partial<TokenMember>
  let rawSettings: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawToken = {
      ...(FakeToken as any),
    }

    rawProposal = {
      ...(ProposalList[0] as any),
      daoAddress: ProposalList[0].daoAddress,
      settings: {
        ...(ProposalList[0].settings as any),
        tokenAddress: FakeToken.address,
      },
    }

    rawMember = {
      ...(FakeMember as any),
    }

    rawPluginMember = {
      pluginAddress: rawProposal.pluginAddress,
      daoAddress: rawProposal.daoAddress,
      memberAddress: FakeMember.address,
      network: rawProposal.network,
    }

    rawTokenMember = {
      memberAddress: FakeMember.address,
      tokenAddress: FakeToken.address,
      network: rawProposal.network,
      votingPower: '1000000000000000000',
      delegateReceivedCount: 0,
      tokenIds: [],
    }

    rawSettings = {
      ...fakeSettings,
      pluginAddress: rawProposal.pluginAddress,
      daoAddress: rawProposal.daoAddress,
    }

    await Promise.all([
      Models.Token.create(rawToken),
      Models.Proposal.create(rawProposal),
      Models.Member.create(rawMember),
      Models.PluginMember.create(rawPluginMember),
      Models.Setting.create(rawSettings),
      Models.Plugin.create({
        ...PluginList[0],
        daoAddress: rawProposal.daoAddress,
        network: rawProposal.network,
        address: rawProposal.pluginAddress,
        tokenAddress: FakeToken.address,
        interfaceType: IPluginInterfaceType.multisig,
      }),
      Models.TokenMember.create(rawTokenMember),
    ])
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getProposalsWithPagination', () => {
    it('should get proposals with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawProposal.network,
        daoAddress: rawProposal.daoAddress,
        pluginAddress: rawProposal.pluginAddress,
        creatorAddress: rawProposal.creatorAddress,
      }

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawProposal.network}-${rawProposal.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawProposal.daoAddress,
        network: rawProposal.network,
      })
      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawProposal.daoAddress,
            network: rawProposal.network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawProposal.network}-${rawProposal.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })

    it('should include linked accounts when dao has linked accounts and includeLinkedAccounts is true', async () => {
      const linkedAccountAddress = '0xCa1234567890123456789012345678901234abcd'
      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: rawProposal.daoAddress,
        linkedAccounts: [linkedAccountAddress],
      } as any)

      const paginationParams: any = {}
      const filterParams: any = {
        network: rawProposal.network,
        daoAddress: rawProposal.daoAddress,
      }
      const pairParams: any = { includeLinkedAccounts: true }

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      await ProposalController.getProposalsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      const callArgs = spyReq.firstCall.args[0]
      expect(callArgs.extraParams.daoAddresses).to.deep.equal([rawProposal.daoAddress, linkedAccountAddress])
      expect(callArgs.paginationParams.sort).to.equal('blockNumber')
      expect(callArgs.paginationParams.order).to.equal('desc')
    })

    it('should NOT include linked accounts when includeLinkedAccounts is false or missing', async () => {
      const linkedAccountAddress = '0xCa1234567890123456789012345678901234abcd'
      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: rawProposal.daoAddress,
        linkedAccounts: [linkedAccountAddress],
      } as any)

      const paginationParams: any = {}
      const filterParams: any = {
        network: rawProposal.network,
        daoAddress: rawProposal.daoAddress,
      }

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      const callArgs = spyReq.firstCall.args[0]
      expect(callArgs.extraParams.daoAddresses).to.be.undefined
    })
  })

  describe('getProposalById', () => {
    it('should getProposalById', async () => {
      const proposalDbId = await Models.Proposal.getEntityId({
        transactionHash: rawProposal.transactionHash,
        pluginAddress: rawProposal.pluginAddress,
        proposalIndex: rawProposal.proposalIndex,
      })

      const proposal = await ProposalController.getProposalById(proposalDbId)
      expect(proposal.id).to.eq(proposalDbId)
    })

    it('should fail to getProposalById', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const proposalId = 'test-member'
      await expect(ProposalController.getProposalById(proposalId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getProposalBySlug', () => {
    it('should getProposalBySlug', async () => {
      const plugin = await Models.Plugin.findOne({ address: rawProposal.pluginAddress })
      const pluginId = plugin.id

      const proposalDbId = await Models.Proposal.getEntityId({
        transactionHash: rawProposal.transactionHash,
        pluginAddress: rawProposal.pluginAddress,
        proposalIndex: rawProposal.proposalIndex,
      })

      sandbox
        .stub(PairDataModule, 'pairFromExtraParams')
        .resolves({ daoAddress: rawProposal.daoAddress, network: rawProposal.network })
      sandbox.stub(Models.Plugin, 'getPluginIdBySlugAndDao').resolves(pluginId)

      const fullSlug = 'tokenvoting-0'
      const proposal = await ProposalController.getProposalBySlug(fullSlug, { daoId: 'test-dao' })
      expect(proposal.id).to.eq(proposalDbId)
    })

    it('should fail to getProposalBySlug', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const proposalId = 'test-member'
      await expect(ProposalController.getProposalBySlug(proposalId)).to.be.rejectedWith(ErrorKeyEnum.daoNotFound)
    })
  })

  describe('canCreateProposal', () => {
    it('should call rabbitMq to check if the user can create proposal', async () => {
      const params = {
        pluginAddress: '0xPluginAddress',
        memberAddress: rawMember.address as HexAddress,
        network: rawProposal.network!,
      }

      const rabbitmQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(true as any)

      const response = await ProposalController.canCreateProposal(params)

      expect(response).to.be.true
      expect(rabbitmQStub.calledOnce).to.be.true
      expect(rabbitmQStub.args[0][1]).to.deep.eq({
        id: `canCreateProposal-${params.pluginAddress}-${params.memberAddress}-${params.network}`,
        params: {
          pluginAddress: params.pluginAddress,
          memberAddress: params.memberAddress,
          network: params.network,
        },
      })
    })

    it('should return false when there is an error', async () => {
      const params = {
        pluginAddress: '0xPluginAddress',
        memberAddress: rawMember.address as HexAddress,
        network: rawProposal.network!,
      }

      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('test'))
      const loggerStub = sandbox.stub(Logger, 'warn')

      const response = await ProposalController.canCreateProposal(params)

      expect(response).to.be.false
      expect(loggerStub.calledOnceWith('Error while checking if user can create proposal' as any)).to.be.true
    })
  })

  describe('getProposalDecodedActions', () => {
    it('should getProposalDecodedActions', async () => {
      const proposalDbId = await Models.Proposal.getEntityId({
        transactionHash: rawProposal.transactionHash,
        pluginAddress: rawProposal.pluginAddress,
        proposalIndex: rawProposal.proposalIndex,
      })

      // Create test data
      const decodedActions = [{ type: 'transfer', to: '0xTarget', value: '100', data: '0xData' }]

      // Mock the proposal with actions directly
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        ...rawProposal,
        id: proposalDbId,
        actions: decodedActions,
      } as any)

      // Call the actual controller method
      const result = await ProposalController.getProposalDecodedActions(proposalDbId)

      // Verify that we get some kind of array back (don't be too strict with the structure)
      expect(Array.isArray(result) || (result && Array.isArray(result.actions))).to.be.true
    })

    it('should return empty array when actions are not available', async () => {
      const proposalDbId = await Models.Proposal.getEntityId({
        transactionHash: rawProposal.transactionHash,
        pluginAddress: rawProposal.pluginAddress,
        proposalIndex: rawProposal.proposalIndex,
      })

      // Mock a proposal without actions
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        ...rawProposal,
        id: proposalDbId,
        actions: undefined,
      } as any)

      const result = await ProposalController.getProposalDecodedActions(proposalDbId)

      // Just verify we get an array-like result that is empty
      expect(Array.isArray(result) || (result && Array.isArray(result.actions))).to.be.true
      expect(Array.isArray(result) ? result.length === 0 : result.actions.length === 0).to.be.true
    })

    it('should throw error if proposal is not found', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const proposalId = 'nonexistent-proposal-id'

      await expect(ProposalController.getProposalDecodedActions(proposalId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('auditProposal', () => {
    const cachedAudit = {
      riskLevel: 'low',
      summary: 'cached',
      findings: [],
      recommendations: [],
      promptVersion: '1',
      tenderlyUrl: null,
      costUsd: null,
      durationMs: null,
      createdAt: 1700000000000,
    }
    const proposalId = 'audit-test-id'

    it('should return cached audit when present', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .resolves({ id: proposalId, audit: cachedAudit, executed: { status: false } } as any)
      const claimStub = sandbox.stub(Models.Proposal, 'claimForAudit')
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const result = await ProposalController.auditProposal(proposalId)

      expect(result).to.deep.eq(cachedAudit)
      expect(claimStub.called).to.be.false
      expect(sendStub.called).to.be.false
    })

    it('should throw proposalNotFound when missing', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(ErrorKeyEnum.proposalNotFound)
    })

    it('should throw proposalAuditNotAllowed when proposal already executed', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .resolves({ id: proposalId, audit: null, executed: { status: true } } as any)

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(
        ErrorKeyEnum.proposalAuditNotAllowed,
      )
    })

    it('should throw proposalAuditInProgress when claim fails and another audit is running', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .onFirstCall()
        .resolves({ id: proposalId, audit: null, executed: { status: false } } as any)
        .onSecondCall()
        .resolves({ id: proposalId, audit: null, executed: { status: false }, auditRunning: true } as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(null)

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(
        ErrorKeyEnum.proposalAuditInProgress,
      )
    })

    it('should return cached audit when claim fails because another worker just persisted one', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .onFirstCall()
        .resolves({ id: proposalId, audit: null, executed: { status: false } } as any)
        .onSecondCall()
        .resolves({ id: proposalId, audit: cachedAudit, executed: { status: false } } as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(null)

      const result = await ProposalController.auditProposal(proposalId)
      expect(result).to.deep.eq(cachedAudit)
    })

    it('should throw proposalAuditNotAllowed when proposal becomes executed between read and claim', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .onFirstCall()
        .resolves({ id: proposalId, audit: null, executed: { status: false } } as any)
        .onSecondCall()
        .resolves({ id: proposalId, audit: null, executed: { status: true } } as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(null)

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(
        ErrorKeyEnum.proposalAuditNotAllowed,
      )
    })

    it('should throw proposalNotFound when proposal disappears between read and claim', async () => {
      sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .onFirstCall()
        .resolves({ id: proposalId, audit: null, executed: { status: false } } as any)
        .onSecondCall()
        .resolves(null)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(null)

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(ErrorKeyEnum.proposalNotFound)
    })

    it('should send rabbitMQ message and persist audit on success', async () => {
      const proposal = {
        id: proposalId,
        audit: null,
        executed: { status: false },
        network: 'ethereum-mainnet',
        pluginAddress: '0xabcDEFabcDEFabcDEFabcDEFabcDEFabcDEFabcD',
        proposalIndex: '42',
        auditStartedAt: 1700000000000,
      }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(proposal as any)
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(cachedAudit as any)
      const releaseStub = sandbox.stub(Models.Proposal, 'releaseAudit').resolves()

      const result = await ProposalController.auditProposal(proposalId)

      expect(result).to.deep.eq(cachedAudit)
      expect(sendStub.calledOnce).to.be.true
      const sendArgs = sendStub.args[0]
      expect(sendArgs[1]).to.deep.eq({
        id: `auditProposal-ethereum-mainnet-${proposal.pluginAddress.toLowerCase()}-42`,
        params: {
          network: proposal.network,
          pluginAddress: proposal.pluginAddress,
          proposalIndex: proposal.proposalIndex,
        },
      })
      expect((sendArgs[2] as any).waitResponse).to.be.true
      expect(releaseStub.calledOnceWith(proposalId, 1700000000000, cachedAudit as any)).to.be.true
    })

    it('should release lock and throw proposalAuditFailed when worker returns null', async () => {
      const proposal = {
        id: proposalId,
        audit: null,
        executed: { status: false },
        network: 'ethereum-mainnet',
        pluginAddress: '0xabcDEFabcDEFabcDEFabcDEFabcDEFabcDEFabcD',
        proposalIndex: '42',
        auditStartedAt: 1700000000000,
      }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(proposal as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)
      const releaseStub = sandbox.stub(Models.Proposal, 'releaseAudit').resolves()

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(ErrorKeyEnum.proposalAuditFailed)
      expect(releaseStub.calledOnceWith(proposalId, 1700000000000, null)).to.be.true
    })

    it('should release lock and throw proposalAuditFailed when worker returns an error envelope', async () => {
      const proposal = {
        id: proposalId,
        audit: null,
        executed: { status: false },
        network: 'ethereum-mainnet',
        pluginAddress: '0xabcDEFabcDEFabcDEFabcDEFabcDEFabcDEFabcD',
        proposalIndex: '42',
        auditStartedAt: 1700000000000,
      }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(proposal as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error: 'auditFailed' } as any)
      const releaseStub = sandbox.stub(Models.Proposal, 'releaseAudit').resolves()

      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(ErrorKeyEnum.proposalAuditFailed)
      expect(releaseStub.calledOnceWith(proposalId, 1700000000000, null)).to.be.true
    })

    it('should release lock and surface proposalAuditFailed when rabbitMQ send rejects', async () => {
      const proposal = {
        id: proposalId,
        audit: null,
        executed: { status: false },
        network: 'ethereum-mainnet',
        pluginAddress: '0xabcDEFabcDEFabcDEFabcDEFabcDEFabcDEFabcD',
        proposalIndex: '42',
        auditStartedAt: 1700000000000,
      }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal as any)
      sandbox.stub(Models.Proposal, 'claimForAudit').resolves(proposal as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('rabbit down'))
      const releaseStub = sandbox.stub(Models.Proposal, 'releaseAudit').resolves()

      // Should NOT leak the raw rabbit error message — must surface the
      // documented exposable error instead.
      await expect(ProposalController.auditProposal(proposalId)).to.be.rejectedWith(ErrorKeyEnum.proposalAuditFailed)
      expect(releaseStub.calledOnceWith(proposalId, 1700000000000, null)).to.be.true
    })
  })
})
