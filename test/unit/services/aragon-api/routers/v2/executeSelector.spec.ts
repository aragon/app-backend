import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ExecuteSelectorRouter from '@api/routers/v2/executeSelector'
import ExecuteSelectorController from '@api/controllers/executeSelector'
import { NetworksEnum } from '@types'

describe.only('RouterV2: ExecuteSelector', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get execute selectors with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        conditionAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(ExecuteSelectorController, 'getExecuteSelectorsWithPagination').returns(true as any)

      const ctx: any = {
        params: {
          network: filterParams.network,
          pluginAddress: filterParams.pluginAddress,
        },
        query: { ...filterParams, ...paginationParams },
      }

      await ExecuteSelectorRouter.getWithPagination(ctx)

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
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })

    it('Should get execute selectors with pagination - minimal params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(ExecuteSelectorController, 'getExecuteSelectorsWithPagination').returns(true as any)

      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams },
      }

      await ExecuteSelectorRouter.getWithPagination(ctx)

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
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        daoAddress: undefined,
        conditionAddress: undefined,
      })
    })

    it('Should get execute selectors with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(ExecuteSelectorController, 'getExecuteSelectorsWithPagination').returns(true as any)

      const ctx: any = {
        params: filterParams,
        query: { ...paginationParams },
      }

      await ExecuteSelectorRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'createdAt',
        order: 'desc',
        page: 1,
        pageSize: 10,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        daoAddress: undefined,
        conditionAddress: undefined,
      })
    })

    it('Should fail validation when network is not provided', async () => {
      const filterParams = {
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const ctx: any = {
        params: filterParams,
        query: {},
      }

      let error: any
      try {
        await ExecuteSelectorRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
    })

    it('Should fail validation when pluginAddress is not provided', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        params: filterParams,
        query: {},
      }

      let error: any
      try {
        await ExecuteSelectorRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
    })
  })
})
