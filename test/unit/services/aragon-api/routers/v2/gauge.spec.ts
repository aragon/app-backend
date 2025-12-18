import GaugeController from '@api/controllers/gauge'
import GaugeRouter from '@api/routers/v2/gauge'
import Router from '@koa/router'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', () => {
    it('should get gauges with pagination - all params', async () => {
      const pluginAddress = '0x1234567890123456789012345678901234567890'
      const network = NetworksEnum.ethereumMainnet

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugesWithPagination').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {
          ...paginationParams,
        },
      }

      await GaugeRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        pluginAddress,
        network,
      })
    })

    it('should get gauges with pagination - different network and pagination', async () => {
      const pluginAddress = '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD'
      const network = NetworksEnum.arbitrumMainnet

      const paginationParams = {
        pageSize: 20,
        page: 2,
        order: 'desc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugesWithPagination').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {
          ...paginationParams,
        },
      }

      await GaugeRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        pluginAddress,
        network,
      })
    })

    it('should get gauges with pagination - missing pagination params', async () => {
      const pluginAddress = '0x9999999999999999999999999999999999999999'
      const network = NetworksEnum.polygonMainnet

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugesWithPagination').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {},
      }

      await GaugeRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const expectedPaginationParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        order: 'desc',
        page: 1,
        pageSize: 10,
        sort: 'blockNumber',
      }

      expect(stubCtrl.args[0][0]).to.deep.eq(expectedPaginationParams)
      expect(stubCtrl.args[0][1]).to.deep.eq({
        pluginAddress,
        network,
      })
    })

    it('should get gauges with custom sort field', async () => {
      const pluginAddress = '0x5555555555555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet

      const paginationParams = {
        pageSize: 5,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugesWithPagination').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {
          ...paginationParams,
        },
      }

      await GaugeRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        pluginAddress,
        network,
      })
    })
  })

  describe('getGaugeEpochMetrics', () => {
    it('should get gauge epoch metrics with all params', async () => {
      const pluginAddress = '0x1234567890123456789012345678901234567890'
      const network = NetworksEnum.ethereumMainnet
      const memberAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugeEpochMetrics').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {
          memberAddress,
          ...paginationParams,
        },
      }

      await GaugeRouter.getGaugeEpochMetrics(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.args[0][0]).to.deep.eq({
        pluginAddress,
        network,
        memberAddress,
      })
    })

    it('should get gauge epoch metrics with different network', async () => {
      const pluginAddress = '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD'
      const network = NetworksEnum.arbitrumMainnet
      const memberAddress = '0x9999999999999999999999999999999999999999'

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugeEpochMetrics').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {
          memberAddress,
        },
      }

      await GaugeRouter.getGaugeEpochMetrics(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.deep.eq({
        pluginAddress,
        network,
        memberAddress,
      })
    })

    it('should get gauge epoch metrics without memberAddress', async () => {
      const pluginAddress = '0x5555555555555555555555555555555555555555'
      const network = NetworksEnum.polygonMainnet

      const stubCtrl = sandbox.stub(GaugeController, 'getGaugeEpochMetrics').returns(true as any)

      const ctx: any = {
        params: {
          pluginAddress,
          network,
        },
        query: {},
      }

      await GaugeRouter.getGaugeEpochMetrics(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.deep.eq({
        pluginAddress,
        network,
        memberAddress: undefined,
      })
    })
  })

  describe('router', () => {
    it('should create router instance', () => {
      const router = GaugeRouter.router()
      expect(router).to.be.instanceOf(Router)
    })

    it('should have GET route for /:pluginAddress/:network', () => {
      const router = GaugeRouter.router()
      const routes = router.stack.map(layer => ({
        path: layer.path,
        methods: layer.methods,
      }))

      expect(routes).to.have.lengthOf(2)
      expect(routes[0].path).to.equal('/:pluginAddress/:network')
      expect(routes[0].methods).to.include('GET')
      expect(routes[1].path).to.equal('/epochMetrics/:pluginAddress/:network')
      expect(routes[1].methods).to.include('GET')
    })

    it('should create a new router instance each time', () => {
      const router1 = GaugeRouter.router()
      const router2 = GaugeRouter.router()

      expect(router1).to.be.instanceOf(Router)
      expect(router2).to.be.instanceOf(Router)
      expect(router1).to.not.equal(router2)
    })
  })
})
