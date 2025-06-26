import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TransactionRouter from '@api/routers/v2/transaction'
import TransactionController from '@api/controllers/transaction'
import { ITransactionCategory, ITransactionIndexCheckType, NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('RouterV2: Transaction', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get transaction with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        category: ITransactionCategory.ERC20,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', // Maps to daoAddress
        tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        fromAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        toAddress: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
      }
      const paginationParams = {
        pageSize: '10',
        page: '1',
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        category: filterParams.category,
        daoAddress: getAddress(filterParams.address), // address -> daoAddress
        fromAddress: getAddress(filterParams.fromAddress),
        toAddress: getAddress(filterParams.toAddress),
        tokenAddress: getAddress(filterParams.tokenAddress),
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({ daoId: undefined })
    })

    it('Should get transaction with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: '10',
        page: '1',
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'blockNumber',
      }

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: undefined,
        daoAddress: undefined,
        category: undefined,
        fromAddress: undefined,
        toAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({ daoId: filterParams.daoId })
    })

    it('Should fail validation when neither daoId nor network with address is provided', async () => {
      const ctx: any = {
        query: {
          category: ITransactionCategory.ERC20,
        },
      }

      let error: any
      try {
        await TransactionRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should fail validation when network is provided without any address', async () => {
      const ctx: any = {
        query: {
          network: NetworksEnum.ethereumMainnet,
          category: ITransactionCategory.ERC20,
        },
      }

      let error: any
      try {
        await TransactionRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should handle lowercase addresses and checksum them', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        fromAddress: '0x742d35cc6634c0532925a3b844bc9e7595f2bd7e',
        toAddress: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: filterParams,
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        category: undefined,
        daoAddress: getAddress(filterParams.address),
        fromAddress: getAddress(filterParams.fromAddress),
        toAddress: getAddress(filterParams.toAddress),
        tokenAddress: getAddress(filterParams.tokenAddress),
      })
    })

    it('Should allow address parameter in query (skipParams)', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        extraParam: 'should-fail', // This should fail validation
      }

      const ctx: any = {
        query: filterParams,
      }

      let error: any
      try {
        await TransactionRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      // The error should be about extraParam, not address (which is skipped)
      expect(error.exposeMeta.validationError.errors[0]).to.include('"value" must have less than or equal')
    })
  })

  describe('getTransactionIndexingStatus', async () => {
    it('Should get transaction indexing status', async () => {
      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionIndexingStatus').returns(true as any)

      const ctx: any = {
        params: {
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          network: NetworksEnum.ethereumMainnet,
        },
        query: {
          type: ITransactionIndexCheckType.PROPOSAL_CREATE,
        },
      }

      await TransactionRouter.getTransactionIndexingStatus(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.args[0]?.[0]).to.eq(ctx.params.txHash)
      expect(stubCtrl.args[0]?.[1]).to.eq(ctx.query.type)
      expect(stubCtrl.args[0]?.[2]).to.eq(ctx.params.network)
    })

    it('Should handle different transaction index check types', async () => {
      const types = [
        ITransactionIndexCheckType.PROPOSAL_CREATE,
        ITransactionIndexCheckType.PROPOSAL_EXECUTE,
        ITransactionIndexCheckType.PROPOSAL_VOTE,
      ]

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionIndexingStatus')

      for (const type of types) {
        stubCtrl.reset()
        stubCtrl.returns({ indexed: true, type } as any)

        const ctx: any = {
          params: {
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            network: NetworksEnum.ethereumMainnet,
          },
          query: { type },
        }

        await TransactionRouter.getTransactionIndexingStatus(ctx)

        expect(stubCtrl.calledOnce).to.be.true
        expect(stubCtrl.args[0]?.[1]).to.eq(type)
        expect(ctx.body).to.deep.eq({ indexed: true, type })
      }
    })

    it('Should fail validation when network is invalid', async () => {
      const ctx: any = {
        params: {
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          network: 'invalid-network',
        },
        query: {
          type: ITransactionIndexCheckType.PROPOSAL_CREATE,
        },
      }

      let error: any
      try {
        await TransactionRouter.getTransactionIndexingStatus(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('Should fail validation when type is missing', async () => {
      const ctx: any = {
        params: {
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          network: NetworksEnum.ethereumMainnet,
        },
        query: {},
      }

      let error: any
      try {
        await TransactionRouter.getTransactionIndexingStatus(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"type" is required')
    })
  })
})
