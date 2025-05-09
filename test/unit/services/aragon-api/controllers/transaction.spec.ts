import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TransactionController from '@services/aragon-api/controllers/transaction'
import { ITokenType, ITransactionCategory, ITransactionIndexCheckType, ITransactionType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import logger from '@logger'

describe('Controller: Transaction', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTransaction = {
      transactionHash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      blockNumber: 1,
      uniqueId: '0x123213',
      network: NetworksEnum.ethereumMainnet,
      type: ITransactionType.deposit,
      category: ITransactionCategory.Internal,
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

  describe('getTransactionIndexingStatus', () => {
    it('should get transaction indexing status', async () => {
      const fakeDao = DaoList[0]
      await Models.Dao.create(fakeDao)

      const txHash = fakeDao.transactionHash
      const network = fakeDao.network
      const spyReq = sandbox.spy(Models.Dao, 'findOne')
      const response = await TransactionController.getTransactionIndexingStatus(
        txHash!,
        ITransactionIndexCheckType.DAO_CREATE,
        network!,
      )
      expect(spyReq.calledOnce).to.be.true
      expect(response).to.deep.eq({
        isProcessed: true,
      })
    })

    it('should get transaction indexing status - not found', async () => {
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

    it('should return false when error', async () => {
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

    describe('proposal advance', () => {
      it('proposal advance', async () => {
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

    describe('proposal executed', () => {
      it('proposal executed', async () => {
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

    describe('proposal created', () => {
      it('proposal created and return slug', async () => {
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

      it('proposal created and return slug when is sub-proposal', async () => {
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
          slug: 'test-slug-0',
        })
      })

      it('proposal created but plugin slug not found', async () => {
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
    })

    describe('proposal report results', () => {
      it('proposal report results not exists', async () => {
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

      it('proposal report results', async () => {
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
  })

  describe('_getQueryForAction', () => {
    it('should return correct query for PROPOSAL_CREATE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_CREATE,
        '0x128',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({ transactionHash: '0x128', network: NetworksEnum.ethereumMainnet })
    })

    it('should return correct query for PROPOSAL_EXECUTE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_EXECUTE,
        '0x129',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({ 'executed.transactionHash': '0x129', network: NetworksEnum.ethereumMainnet })
    })

    it('should return correct query for PROPOSAL_ADVANCE_STAGE', () => {
      const query = TransactionController._getQueryForAction(
        ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
        '0x130',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({ 'stageExecutions.transactionHash': '0x130', network: NetworksEnum.ethereumMainnet })
    })

    it('should return default query for unknown action', () => {
      const query = TransactionController._getQueryForAction(
        'UNKNOWN_ACTION' as ITransactionIndexCheckType,
        '0x131',
        NetworksEnum.ethereumMainnet,
      )
      expect(query).to.deep.equal({ transactionHash: '0x131', network: NetworksEnum.ethereumMainnet })
    })
  })
})
