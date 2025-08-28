import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TransactionController from '@services/aragon-api/controllers/transaction'
import {
  IPluginInterfaceType,
  IPluginStatus,
  ITokenType,
  ITransactionIndexCheckType,
  ITransactionType,
  ITransactionSide,
  NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import logger from '@logger'

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
      it('should return isProcessed true when DAO creation transaction is found', async () => {
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
        expect(response).to.deep.eq({
          isProcessed: false,
        })
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
