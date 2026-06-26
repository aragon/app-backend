import { Models } from '@dbModels'
import logger from '@logger'
import Transaction from '@models/schema/transaction'
import TransactionController from '@services/aragon-api/controllers/transaction'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import {
  IPluginInterfaceType,
  IPluginStatus,
  ITokenType,
  ITransactionIndexCheckType,
  ITransactionSide,
  ITransactionType,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('TransactionController', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Setup default transaction data for tests
    rawTransaction = {
      transactionHash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      blockNumber: 1,
      network: NetworksEnum.ethereumMainnet,
      side: ITransactionSide.deposit,
      type: ITransactionType.native,
      fromAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc0',
      toAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
      value: '0x0',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc9',
      daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc8',
      tokenId: '1',
      erc721TokenId: '1',
      erc1155Metadata: [
        {
          tokenId: '1',
          value: '0',
        },
      ],
      proposalId: '18',
      token: {
        network: NetworksEnum.ethereumMainnet,
        address: '0x2902b792af43ea1481569bc35b62a31bb2c20e95',
        symbol: 'FREE',
        name: 'FREEthereum',
        type: ITokenType.ERC20,
        decimals: 18,
        logo: 'fake-logo',
        snapshot: {
          priceUsd: '0',
          priceUpdatedAt: 1,
        },
      },
    }
    await Models.Transaction.create(rawTransaction)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getTransactionsWithPagination()', () => {
    it('should return paginated transactions with filtered keys', async () => {
      const mockTransaction = {
        filterKeys: sandbox.stub().returns({ id: '1', value: '100' }),
      }

      const findWithPaginationStub = sandbox.stub(Models.Transaction, 'findWithPagination').resolves({
        data: [mockTransaction, mockTransaction],
        metadata: {
          totalRecords: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      })

      const result = await TransactionController.getTransactionsWithPagination(
        { page: 1, limit: 10 },
        { daoAddress: '0xdao', network: NetworksEnum.ethereumMainnet },
      )

      expect(findWithPaginationStub.calledOnce).to.be.true
      expect(mockTransaction.filterKeys.calledTwice).to.be.true
      expect(result.data).to.have.lengthOf(2)
      expect(result.data[0]).to.deep.equal({ id: '1', value: '100' })
    })

    it('should handle empty results', async () => {
      const findWithPaginationStub = sandbox.stub(Models.Transaction, 'findWithPagination').resolves({
        data: [],
        metadata: {
          totalRecords: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
        },
      })

      const result = await TransactionController.getTransactionsWithPagination()

      expect(findWithPaginationStub.calledOnce).to.be.true
      expect(result.data).to.have.lengthOf(0)
      expect(result.metadata.totalRecords).to.equal(0)
    })
  })

  describe('getExecutionActions()', () => {
    const network = NetworksEnum.ethereumMainnet
    const pluginAddress = '0xPluginExec00000000000000000000000000000001'
    const daoAddress = '0xDaoExec0000000000000000000000000000000001'

    // a plugin execution carries pluginAddress + proposalIndex; a direct one carries neither
    const seedExecution = (transactionHash: string, proposalIndex?: string, extra: Record<string, any> = {}) =>
      Models.Transaction.create({
        transactionHash,
        blockNumber: 10,
        blockTimestamp: 10,
        network,
        side: ITransactionSide.execution,
        type: ITransactionType.execution,
        fromAddress: pluginAddress,
        toAddress: daoAddress,
        value: '0',
        daoAddress,
        pluginAddress: proposalIndex ? pluginAddress : undefined,
        proposalIndex,
        actionCount: 1,
        source: 'tokenVoting',
        ...extra,
      })

    it('returns the decoded actions and proposal slug from the linked proposal', async () => {
      await Models.Proposal.create({
        daoAddress,
        proposalIndex: '5',
        incrementalId: 3,
        blockNumber: 1,
        pluginAddress,
        transactionHash: '0xcreate',
        network,
        startDate: 1,
        endDate: 1,
        creatorAddress: '0xcreator',
        rawActions: [{ to: '0xtarget', value: '0', data: '0xabcdef' }],
      })
      await Models.PluginSlug.create({ network, daoAddress, pluginAddress, slug: 'core' })
      const exec = await seedExecution('0xexecTx', '5')

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.rawActions).to.have.lengthOf(1)
      expect(res.rawActions[0].data).to.eq('0xabcdef')
      expect(res.proposalSlug).to.eq('core-3')
    })

    it('returns a null proposalSlug when the linked proposal has no plugin slug', async () => {
      await Models.Proposal.create({
        daoAddress,
        proposalIndex: '8',
        incrementalId: 2,
        blockNumber: 1,
        pluginAddress,
        transactionHash: '0xcreate',
        network,
        startDate: 1,
        endDate: 1,
        creatorAddress: '0xcreator',
        rawActions: [{ to: '0xtarget', value: '0', data: '0xabcdef' }],
      })
      const exec = await seedExecution('0xexecNoSlug', '8')

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.proposalSlug).to.be.null
      expect(res.rawActions).to.have.lengthOf(1)
    })

    it('serves null base fields when the row has not recorded them', async () => {
      const exec = await seedExecution('0xbareExec', undefined, {
        actionCount: null,
        blockTimestamp: undefined,
        source: null,
      })

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.actionCount).to.be.null
      expect(res.blockTimestamp).to.be.null
      expect(res.source).to.be.null
    })

    it('returns empty actions for a raw execution with no linked proposal', async () => {
      const exec = await seedExecution('0xrawExec')

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res).to.deep.include({ proposalSlug: null, decoding: false })
      expect(res.actions).to.have.lengthOf(0)
      expect(res.rawActions).to.have.lengthOf(0)
    })

    it('returns the detail base fields the (deep-linkable) execution dialog needs', async () => {
      const exec = await seedExecution('0xbaseExec')

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.transactionHash).to.eq('0xbaseExec')
      expect(res.executedBy).to.eq(pluginAddress)
      expect(res.source).to.eq('tokenVoting')
      expect(res.actionCount).to.eq(1)
      expect(res.blockTimestamp).to.eq(10)
    })

    it('keeps the client polling for a plugin execution whose proposal is not indexed yet', async () => {
      // worker not finalized yet (source null) and no proposal to read through
      const exec = await seedExecution('0xpendingExec', '99', { source: null })

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.decoding).to.eq(true)
      expect(res.actions).to.have.lengthOf(0)
    })

    it('serves the fallback-decoded actions for a plugin-classified row with no backing proposal', async () => {
      const exec = await seedExecution('0xcustomCallId', '424242', {
        rawActions: [{ to: '0x222', value: '0', data: '0x' }],
        actions: [{ type: 'transferNative' }],
      })

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res).to.deep.include({ proposalSlug: null, decoding: false })
      expect(res.actions.map((a: any) => a.type)).to.deep.eq(['transferNative'])
      expect(res.rawActions).to.have.lengthOf(1)
    })

    it('serves actions stored on the execution row without a proposal', async () => {
      const exec = await seedExecution('0xstoredExec', undefined, {
        actionCount: 2,
        rawActions: [
          { to: '0x222', value: '0', data: '0xabcdef12' },
          { to: '0x333', value: '1000', data: '0x' },
        ],
        actions: [{ type: 'unknown' }, { type: 'transferNative' }],
      })

      const res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.proposalSlug).to.be.null
      expect(res.rawActions).to.have.lengthOf(2)
      expect(res.rawActions[0].data).to.eq('0xabcdef12')
      expect(res.actions.map((a: any) => a.type)).to.deep.eq(['unknown', 'transferNative'])
    })

    it('addresses a specific execution by id when one tx holds multiple executions on the same DAO', async () => {
      await seedExecution('0xsharedTx', undefined, {
        logIndex: 5,
        rawActions: [{ to: '0x111', value: '0', data: '0x01020304' }],
        actions: [{ type: 'first' }],
      })
      const second = await seedExecution('0xsharedTx', undefined, {
        logIndex: 9,
        rawActions: [{ to: '0x999', value: '0', data: '0x0a0b0c0d' }],
        actions: [{ type: 'second' }],
      })

      const res = await TransactionController.getExecutionActions({ id: second.id, network })
      expect(res.rawActions[0].data).to.eq('0x0a0b0c0d')
      expect(res.actions[0].type).to.eq('second')
    })

    it('reflects the live proposal decode state rather than a frozen snapshot', async () => {
      // execution row carries the link but no stored actions; the proposal is still decoding
      await Models.Proposal.create({
        daoAddress,
        proposalIndex: '11',
        incrementalId: 4,
        blockNumber: 1,
        pluginAddress,
        transactionHash: '0xcreate',
        network,
        startDate: 1,
        endDate: 1,
        creatorAddress: '0xcreator',
        rawActions: [{ to: '0xtarget', value: '0', data: '0xabcdef' }],
        decoding: true,
      })
      await Models.PluginSlug.create({ network, daoAddress, pluginAddress, slug: 'core' })
      const exec = await seedExecution('0xexecLive', '11')

      // still decoding -> decoding flag surfaced from the live proposal, not a frozen actions:[]
      let res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.decoding).to.eq(true)
      expect(res.proposalSlug).to.eq('core-4')

      // once the proposal finishes decoding, the same row now serves the decoded actions
      await Models.Proposal.updateOne(
        { proposalIndex: '11', pluginAddress, network },
        { $set: { actions: [{ type: 'transfer' }], decoding: false } },
      )
      res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.decoding).to.eq(false)
      expect(res.actions.map((a: any) => a.type)).to.deep.eq(['transfer'])
    })

    it('links lazily when the execution was indexed before its proposal', async () => {
      const exec = await seedExecution('0xexecOrphan', '13', { source: null })

      let res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res).to.deep.include({ proposalSlug: null, decoding: true })
      expect(res.actions).to.have.lengthOf(0)

      // proposal arrives -> the same row resolves to it
      await Models.Proposal.create({
        daoAddress,
        proposalIndex: '13',
        incrementalId: 6,
        blockNumber: 1,
        pluginAddress,
        transactionHash: '0xcreate',
        network,
        startDate: 1,
        endDate: 1,
        creatorAddress: '0xcreator',
        rawActions: [{ to: '0xtarget', value: '0', data: '0xabcdef' }],
      })
      await Models.PluginSlug.create({ network, daoAddress, pluginAddress, slug: 'core' })

      res = await TransactionController.getExecutionActions({ id: exec.id, network })
      expect(res.proposalSlug).to.eq('core-6')
      expect(res.rawActions[0].data).to.eq('0xabcdef')
    })

    it('throws not found when the execution does not exist', async () => {
      let threw = false
      try {
        await TransactionController.getExecutionActions({ id: '0xmissing-execution-id', network })
      } catch (_e) {
        threw = true
      }
      expect(threw).to.be.true
    })
  })

  describe('getTransactionIndexingStatus()', () => {
    describe('Common functionality', () => {
      it('should handle errors gracefully and return isProcessed false', async () => {
        const txHash = '0x'
        const network = rawTransaction.network
        sandbox.stub(Models.Proposal, 'findOne').rejects(new Error('fake-error'))

        const response = await TransactionController.getTransactionIndexingStatus(
          txHash,
          ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
          network!,
        )

        expect(response).to.deep.eq({
          isProcessed: false,
        })
      })
    })

    describe('DAO_CREATE indexing', () => {
      it('should return isProcessed true when DAO and admin plugin member exist', async () => {
        const fakeDao = DaoList[0]
        const adminPluginAddress = '0xadminplugin001'
        await Models.Dao.create(fakeDao)
        await Models.Plugin.create({
          transactionHash: fakeDao.transactionHash,
          daoAddress: fakeDao.address,
          network: fakeDao.network,
          address: adminPluginAddress,
          interfaceType: IPluginInterfaceType.admin,
          status: IPluginStatus.installed,
          blockNumber: 1,
        })
        await Models.PluginMember.create({
          daoAddress: fakeDao.address,
          network: fakeDao.network,
          address: '0xadminmember001',
          memberAddress: '0xadminmember001',
          pluginAddress: adminPluginAddress,
          blockNumber: 1,
          transactionHash: fakeDao.transactionHash,
        })

        const response = await TransactionController.getTransactionIndexingStatus(
          fakeDao.transactionHash!,
          ITransactionIndexCheckType.DAO_CREATE,
          fakeDao.network!,
        )

        expect(response).to.deep.eq({ isProcessed: true })
      })

      it('should return isProcessed false when DAO exists but no admin plugin member', async () => {
        const fakeDao = DaoList[0]
        await Models.Dao.create(fakeDao)

        const response = await TransactionController.getTransactionIndexingStatus(
          fakeDao.transactionHash!,
          ITransactionIndexCheckType.DAO_CREATE,
          fakeDao.network!,
        )

        expect(response).to.deep.eq({ isProcessed: false })
      })

      it('should return isProcessed false when DAO creation transaction is not found', async () => {
        const txHash = '0x128'
        const network = rawTransaction.network
        const spyReq = sandbox.spy(Models.Dao, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          txHash,
          ITransactionIndexCheckType.DAO_CREATE,
          network!,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.eq({ isProcessed: false })
      })
    })

    describe('PROPOSAL_CREATE indexing', () => {
      it('should return isProcessed true with slug when proposal is created', async () => {
        await Models.Proposal.create({
          ...ProposalList[0],
          transactionHash: '0x125',
        })

        await Models.PluginSlug.create({
          daoAddress: ProposalList[0].daoAddress,
          pluginAddress: ProposalList[0].pluginAddress,
          network: ProposalList[0].network,
          slug: 'test-slug',
        })

        const network = ProposalList[0].network
        const spyProposalReq = sandbox.spy(Models.Proposal, 'findOne')
        const spyPluginSlugReq = sandbox.spy(Models.PluginSlug, 'findOne')
        sandbox.stub(Models.Plugin, 'findByAddress').resolves({})

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x125',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(spyProposalReq.calledOnce).to.be.true
        expect(spyPluginSlugReq.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: true,
          slug: 'test-slug-0',
        })
      })

      it('should return slug for sub-proposal when parent plugin exists', async () => {
        // Create parent proposal
        await Models.Proposal.create({
          daoAddress: ProposalList[0].daoAddress,
          proposalIndex: '0',
          incrementalId: 0,
          transactionHash: '0x126',
          pluginAddress: ProposalList[0].pluginAddress,
          network: ProposalList[0].network,
          endDate: 1,
          blockNumber: 1,
          startDate: 1,
          creatorAddress: '0xcreator',
        })

        // Create sub-proposal
        await Models.Proposal.create({
          daoAddress: ProposalList[0].daoAddress,
          proposalIndex: '7',
          incrementalId: 7,
          blockNumber: 1,
          pluginAddress: '0xplugin2',
          transactionHash: '0x126',
          network: ProposalList[0].network,
          endDate: 1,
          startDate: 1,
          creatorAddress: '0xcreator',
        })

        await Models.PluginSlug.create({
          daoAddress: ProposalList[0].daoAddress,
          pluginAddress: ProposalList[0].pluginAddress,
          network: ProposalList[0].network,
          slug: 'test-slug',
        })

        const network = ProposalList[0].network
        sandbox.stub(Models.Plugin, 'findByAddress').resolves({ parentPlugin: ProposalList[0].pluginAddress })

        const spyPluginSlugReq = sandbox.spy(Models.PluginSlug, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x126',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(spyPluginSlugReq.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: true,
          slug: 'test-slug-7',
        })
      })

      it('should return isProcessed false when sub-proposal has parent plugin but parent proposal not found', async () => {
        // Create sub-proposal only (no parent proposal)
        await Models.Proposal.create({
          daoAddress: ProposalList[0].daoAddress,
          proposalIndex: '8',
          incrementalId: 8,
          blockNumber: 1,
          pluginAddress: '0xplugin3',
          transactionHash: '0x127sub',
          network: ProposalList[0].network,
          endDate: 1,
          startDate: 1,
          creatorAddress: '0xcreator',
        })

        const network = ProposalList[0].network
        const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress')
        findByAddressStub.resolves({ parentPlugin: '0xparentPlugin' })

        const spyProposalReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x127sub',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(findByAddressStub.calledOnce).to.be.true
        expect(spyProposalReq.calledTwice).to.be.true // Once for main proposal, once for parent proposal
        expect(response).to.deep.eq({
          isProcessed: false,
        })
      })

      it('should log error and return isProcessed true when plugin slug is not found', async () => {
        const logError = sandbox.stub(logger, 'error')

        await Models.Proposal.create({
          ...ProposalList[0],
          transactionHash: '0x127',
        })

        const network = ProposalList[0].network
        const spyProposalReq = sandbox.spy(Models.Proposal, 'findOne')
        const spyPluginSlugReq = sandbox.spy(Models.PluginSlug, 'findOne')
        sandbox.stub(Models.Plugin, 'findByAddress').resolves({})

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x127',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(spyProposalReq.calledOnce).to.be.true
        expect(spyPluginSlugReq.calledOnce).to.be.true
        expect(logError.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: true,
        })
      })

      it('should not log error when plugin slug is not found and plugin is uninstalled', async () => {
        const logError = sandbox.stub(logger, 'error')

        await Models.Proposal.create({
          ...ProposalList[0],
          transactionHash: '0x127uninstalled',
        })

        const network = ProposalList[0].network
        sandbox.stub(Models.Plugin, 'findByAddress').resolves({
          uninstalled: { status: true, transactionHash: '0xuninstall', blockNumber: 100 },
        })

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x127uninstalled',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(logError.called).to.be.false
        expect(response).to.deep.eq({
          isProcessed: true,
        })
      })

      it('should not log error when parent plugin is uninstalled and slug is missing', async () => {
        const logError = sandbox.stub(logger, 'error')

        await Models.Proposal.create({
          daoAddress: ProposalList[0].daoAddress,
          proposalIndex: '0',
          incrementalId: 0,
          blockNumber: 1,
          logIndex: 0,
          pluginAddress: '0xparentPluginUninstalled',
          transactionHash: '0x127parentUninstalled',
          network: ProposalList[0].network,
          endDate: 1,
          startDate: 1,
          creatorAddress: '0xcreator',
        })

        await Models.Proposal.create({
          daoAddress: ProposalList[0].daoAddress,
          proposalIndex: '9',
          incrementalId: 9,
          blockNumber: 1,
          logIndex: 1,
          pluginAddress: '0xchildPlugin',
          transactionHash: '0x127parentUninstalled',
          network: ProposalList[0].network,
          endDate: 1,
          startDate: 1,
          creatorAddress: '0xcreator',
        })

        const network = ProposalList[0].network
        const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress')
        findByAddressStub.withArgs('0xchildPlugin', network).resolves({
          parentPlugin: '0xparentPluginUninstalled',
        })
        findByAddressStub.withArgs('0xparentPluginUninstalled', network).resolves({
          uninstalled: { status: true, transactionHash: '0xuninstall', blockNumber: 200 },
        })

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x127parentUninstalled',
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(findByAddressStub.calledTwice).to.be.true
        expect(logError.called).to.be.false
        expect(response).to.deep.eq({
          isProcessed: true,
        })
      })

      it('should return isProcessed false when proposal is not found', async () => {
        const txHash = '0x128'
        const network = rawTransaction.network
        const spyReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          txHash,
          ITransactionIndexCheckType.PROPOSAL_CREATE,
          network!,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: false,
        })
      })
    })

    describe('PROPOSAL_ADVANCE_STAGE indexing', () => {
      it('should return isProcessed true when stage execution is found', async () => {
        await Models.Proposal.create({
          ...ProposalList[0],
          stageExecutions: [
            {
              transactionHash: '0x123',
            },
          ],
        })

        const network = ProposalList[0].network
        const spyReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x123',
          ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
          network!,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: true,
        })
      })
    })

    describe('PROPOSAL_EXECUTE indexing', () => {
      it('should return isProcessed true when proposal execution is found', async () => {
        await Models.Proposal.create({
          ...ProposalList[0],
          executed: {
            transactionHash: '0x124',
          },
        })

        const network = ProposalList[0].network
        const spyReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          '0x124',
          ITransactionIndexCheckType.PROPOSAL_EXECUTE,
          network!,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.eq({
          isProcessed: true,
        })
      })
    })

    describe('PROPOSAL_REPORT_RESULTS indexing', () => {
      it('should return isProcessed false when proposal results do not exist', async () => {
        await Models.Proposal.create({
          ...ProposalList[0],
        })

        const network = ProposalList[0].network
        const spyProposalReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          ProposalList[0].transactionHash,
          ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS,
          network!,
        )

        expect(spyProposalReq.calledOnce).to.be.true
        expect(response.isProcessed).to.be.false
      })

      it('should return isProcessed true with result details when proposal results exist', async () => {
        await Models.Proposal.create({
          ...ProposalList[0],
          ...{
            stageIndex: 0,
            totalStages: 1,
            subProposals: [
              {
                pluginAddress: '0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F',
                proposalIndex: '0',
                stageIndex: 0,
                transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
                blockNumber: 8185135,
              },
              {
                pluginAddress: '0x45B7de03cbFc5163446557B2FF209a0aFfcbDC5E',
                proposalIndex: '59638062734096546706360171231707009963581720596085250721272336933311096790965',
                stageIndex: 0,
                transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
                blockNumber: 8185135,
              },
            ],
          },
          results: [
            {
              resultType: 2,
              stage: 0,
              pluginAddress: '0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F',
              transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
              blockNumber: 8185135,
            },
          ],
        })

        const network = ProposalList[0].network
        const spyProposalReq = sandbox.spy(Models.Proposal, 'findOne')

        const response = await TransactionController.getTransactionIndexingStatus(
          '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
          ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS,
          network!,
        )

        expect(spyProposalReq.calledOnce).to.be.true
        expect(response.isProcessed).to.be.true
        expect(response.resultType).to.eq(2)
        expect(response.stage).to.eq(0)
      })
    })

    describe('LOCK_CREATE indexing', () => {
      it('should return isProcessed true when lock creation is found', async () => {
        const fakeLock: any = {
          transactionHash: '0xlockTx123',
          transactionIndex: 3,
          logIndex: 1,
          tokenId: '0x123',
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 1000,
          isProcessed: true,
          memberAddress: '0xmember123',
          tokenAddress: '0xtoken123',
          amount: '1000',
          exitQueueAddress: '0xexitQueue123',
          escrowAddress: '0xescrow123',
          nftAddress: '0xnft123',
        }

        await Models.Lock.create(fakeLock)

        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xlockTx123',
          ITransactionIndexCheckType.LOCK_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(spyReq.firstCall.args[0]).to.deep.equal({
          transactionHash: '0xlockTx123',
          network: NetworksEnum.ethereumMainnet,
        })
        expect(response).to.deep.equal({
          isProcessed: true,
        })
      })

      it('should return isProcessed false when lock creation is not found', async () => {
        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xnonExistentLock',
          ITransactionIndexCheckType.LOCK_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.equal({
          isProcessed: false,
        })
      })
    })

    describe('EXIT_CREATE indexing', () => {
      it('should return isProcessed true when lock exit is found', async () => {
        const fakeLockWithExit: any = {
          transactionHash: '0xlockTx123',
          transactionIndex: 3,
          logIndex: 1,
          tokenId: '0x123',
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 2000,
          isProcessed: true,
          memberAddress: '0xmember456',
          tokenAddress: '0xtoken456',
          amount: '1000',
          exitQueueAddress: '0xexitQueue123',
          escrowAddress: '0xescrow456',
          nftAddress: '0xnft456',
          lockExit: {
            status: true,
            transactionHash: '0xlockExitTx123',
            blockNumber: 2001,
            blockTimestamp: 1234567890,
            exitDateAt: 1234567900,
          },
        }
        await Models.Lock.create(fakeLockWithExit)

        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xlockExitTx123',
          ITransactionIndexCheckType.EXIT_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(spyReq.firstCall.args[0]).to.deep.equal({
          network: NetworksEnum.ethereumMainnet,
          'lockExit.transactionHash': '0xlockExitTx123',
          'lockExit.status': true,
        })
        expect(response).to.deep.equal({
          isProcessed: true,
        })
      })

      it('should return isProcessed false when lock exit is not found', async () => {
        const fakeLockWithoutExit: any = {
          transactionHash: '0xlockTx123',
          transactionIndex: 3,
          logIndex: 1,
          tokenId: '0x123',
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 2000,
          isProcessed: false,
          memberAddress: '0xmember456',
          tokenAddress: '0xtoken456',
          amount: '1000',
          exitQueueAddress: '0xexitQueue123',
          escrowAddress: '0xescrow456',
          nftAddress: '0xnft456',
          lockExit: {
            status: false,
            transactionHash: null,
            blockNumber: null,
            blockTimestamp: null,
            exitDateAt: null,
          },
        }

        await Models.Lock.create(fakeLockWithoutExit)

        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xlockNoExitTx',
          ITransactionIndexCheckType.EXIT_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.equal({
          isProcessed: false,
        })
      })
    })

    describe('WITHDRAW_CREATE indexing', () => {
      it('should return isProcessed true when lock withdrawal is found', async () => {
        const fakeLockWithWithdraw: any = {
          transactionHash: '0xlockTx123',
          transactionIndex: 3,
          logIndex: 1,
          tokenId: '0x123',
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 3000,
          isProcessed: false,
          memberAddress: '0xmember456',
          tokenAddress: '0xtoken456',
          amount: '1000',
          exitQueueAddress: '0xexitQueue123',
          escrowAddress: '0xescrow456',
          nftAddress: '0xnft456',
          lockWithdraw: {
            status: true,
            transactionHash: '0xlockWithdrawTx123',
            blockNumber: 3001,
            blockTimestamp: 1234567890,
            totalLocked: '5000',
            amount: '1000',
            epochEndAt: 1234567900,
          },
        }

        await Models.Lock.create(fakeLockWithWithdraw)

        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xlockWithdrawTx123',
          ITransactionIndexCheckType.WITHDRAW_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(spyReq.firstCall.args[0]).to.deep.equal({
          network: NetworksEnum.ethereumMainnet,
          'lockWithdraw.status': true,
          'lockWithdraw.transactionHash': '0xlockWithdrawTx123',
        })
        expect(response).to.deep.equal({
          isProcessed: true,
        })
      })

      it('should return isProcessed false when lock withdrawal is not found', async () => {
        const spyReq = sandbox.spy(Models.Lock, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xnonExistentWithdraw',
          ITransactionIndexCheckType.WITHDRAW_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.equal({
          isProcessed: false,
        })
      })
    })

    describe('PLUGIN_CREATE indexing', () => {
      it('should return plugin details when supported plugin is found', async () => {
        const fakePlugin: any = {
          id: 'plugin-1',
          transactionHash: '0xpluginTx123',
          network: NetworksEnum.ethereumMainnet,
          address: '0xpluginAddress123',
          blockNumber: 4000,
          interfaceType: IPluginInterfaceType.multisig,
          status: IPluginStatus.installed,
          isSupported: true,
          daoAddress: '0xdao123',
        }

        await Models.Plugin.create(fakePlugin)

        const spyReq = sandbox.spy(Models.Plugin, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xpluginTx123',
          ITransactionIndexCheckType.PLUGIN_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(spyReq.firstCall.args[0]).to.deep.equal({
          transactionHash: '0xpluginTx123',
          network: NetworksEnum.ethereumMainnet,
        })
        expect(response).to.deep.equal({
          isProcessed: true,
          isSupported: true,
          interfaceType: IPluginInterfaceType.multisig,
        })
      })

      it('should return plugin details when unsupported plugin is found', async () => {
        const fakeUnsupportedPlugin: any = {
          id: 'plugin-unsupported-1',
          transactionHash: '0xpluginUnsupportedTx',
          network: NetworksEnum.ethereumMainnet,
          address: '0xpluginAddressUnsupported',
          blockNumber: 4100,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          isSupported: false,
          daoAddress: '0xdao456',
        }

        await Models.Plugin.create(fakeUnsupportedPlugin)

        const response = await TransactionController.getTransactionIndexingStatus(
          '0xpluginUnsupportedTx',
          ITransactionIndexCheckType.PLUGIN_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(response).to.deep.equal({
          isProcessed: true,
          isSupported: false,
          interfaceType: IPluginInterfaceType.tokenVoting,
        })
      })

      it('should return isProcessed false when plugin is not found', async () => {
        const spyReq = sandbox.spy(Models.Plugin, 'findOne')
        const response = await TransactionController.getTransactionIndexingStatus(
          '0xnonExistentPlugin',
          ITransactionIndexCheckType.PLUGIN_CREATE,
          NetworksEnum.ethereumMainnet,
        )

        expect(spyReq.calledOnce).to.be.true
        expect(response).to.deep.equal({
          isProcessed: false,
        })
      })
    })
  })

  describe('_getQueryForAction()', () => {
    it('should return base query for PROPOSAL_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_CREATE,
        '0x128',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        transactionHash: '0x128',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return nested query for PROPOSAL_EXECUTE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_EXECUTE,
        '0x129',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        'executed.transactionHash': '0x129',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return nested query for PROPOSAL_ADVANCE_STAGE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
        '0x130',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        'stageExecutions.transactionHash': '0x130',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return nested query for PROPOSAL_REPORT_RESULTS', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS,
        '0x131',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        'results.transactionHash': '0x131',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return base query for LOCK_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.LOCK_CREATE,
        '0x132',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        transactionHash: '0x132',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return nested query for EXIT_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.EXIT_CREATE,
        '0x133',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        network: NetworksEnum.ethereumMainnet,
        'lockExit.transactionHash': '0x133',
        'lockExit.status': true,
      })
    })

    it('should return nested query for WITHDRAW_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.WITHDRAW_CREATE,
        '0x134',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        network: NetworksEnum.ethereumMainnet,
        'lockWithdraw.status': true,
        'lockWithdraw.transactionHash': '0x134',
      })
    })

    it('should return base query for PLUGIN_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PLUGIN_CREATE,
        '0x135',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        transactionHash: '0x135',
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should return default query for unknown action', () => {
      const query = TransactionController._getQueryForAction(
        'UNKNOWN_ACTION' as ITransactionIndexCheckType,
        '0x136',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({
        transactionHash: '0x136',
        network: NetworksEnum.ethereumMainnet,
      })
    })
  })
})
