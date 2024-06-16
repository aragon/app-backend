import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoRouter from '@services/aragon-api/routers/dao'
import DaoController from '@services/aragon-api/controllers/dao'
import { NetworksEnum } from '@types'

describe('Router: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get dao with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.mainnet,
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaosWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DaoRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })

    it('Should get dao with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.mainnet,
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaosWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DaoRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        order: 'desc',
        page: 1,
        pageSize: 10,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({ ...filterParams, ...{ pluginAddress: undefined } })
    })
  })

  describe('getDaoByPermalink', async () => {
    it('Should get dao', async () => {
      const params = {
        permalink: 'xxx',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoByPermalink').returns(true as any)

      const ctx: any = {
        params,
      }

      await DaoRouter.getDaoByPermalink(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith(params.permalink)).to.be.true
    })

    it('Should get dao with unformatted address in permalink', async () => {
      const params = {
        permalink: 'polygon-0x6aab1ce54b204f96d0c7bc022055b78ade2d71e9',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoByPermalink').returns(true as any)

      const ctx: any = {
        params,
      }

      await DaoRouter.getDaoByPermalink(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith('polygon-0x6AaB1cE54B204f96d0c7Bc022055b78adE2D71e9')).to.be.true
    })
  })

  describe('getDaoPlugin', async () => {
    it('should get dao plugin', async () => {
      const params = {
        permalink: 'xxx',
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }
      const stubCtrl = sandbox.stub(DaoController, 'getDaoPlugin').returns(true as any)
      const ctx: any = {
        params,
      }
      await DaoRouter.getDaoPlugin(ctx)
      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.calledWith(params)).to.be.true
    })
  })

  describe('getDaoPluginSettings', async () => {
    it('should get dao plugin settings', async () => {
      const params = {
        permalink: 'xxx',
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }
      const stubCtrl = sandbox.stub(DaoController, 'getDaoPluginSettings').returns(true as any)
      const ctx: any = {
        params,
      }
      await DaoRouter.getDaoPluginSettings(ctx)
      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.calledWith(params)).to.be.true
    })
  })

  describe('getDaoMembersWithPagination', async () => {
    it('Should get getDaoMembersWithPagination', async () => {
      const filterParams = {
        permalink: 'xxx',
      }

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoMembersWithPagination').returns(true as any)

      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams, pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA' },
      }

      await DaoRouter.getDaoMembersWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        ...{ pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA' },
      })
    })
  })

  describe('getDaoProposalsWithPagination', async () => {
    it('Should get getDaoProposalsWithPagination', async () => {
      const filterParams = {
        permalink: 'xxx',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'proposalId',
      }
      const stubCtrl = sandbox.stub(DaoController, 'getDaoProposalsWithPagination').returns(true as any)
      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams, pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA' },
      }
      await DaoRouter.getProposalsWithPagination(ctx)
      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        ...{ pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA' },
      })
    })
  })

  describe('getAssetsWithPagination', async () => {
    it('Should get getAssetsWithPagination', async () => {
      const filterParams = {
        permalink: 'xxx',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'amountUsd',
      }
      const stubCtrl = sandbox.stub(DaoController, 'getDaoAssetsWithPagination').returns(true as any)
      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams },
      }
      await DaoRouter.getAssetsWithPagination(ctx)
      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })
  })

  describe('getTransactionsWithPagination', async () => {
    it('Should get getTransactionsWithPagination', async () => {
      const filterParams = {
        permalink: 'xxx',
      }

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams },
      }

      await DaoRouter.getTransactionsWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })
  })
})
