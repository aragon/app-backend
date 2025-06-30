import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SettingRouter from '@api/routers/v1/setting'
import SettingController from '@api/controllers/setting'
import { NetworksEnum } from '@types'

describe('RouterV1: Setting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get setting with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getSettingsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await SettingRouter.getWithPagination(ctx)

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
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })

    it('Should get setting with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getSettingsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await SettingRouter.getWithPagination(ctx)

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
        network: undefined,
        daoAddress: undefined,
        pluginAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq(filterParams)
    })

    it('Should get setting with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getSettingsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await SettingRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        order: 'desc',
        page: 1,
        pageSize: 10,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        ...{ daoAddress: undefined, pluginAddress: undefined },
      })
    })
  })

  it('Should getActiveSettingByDaoId', async () => {
    const params = {
      daoId: `${NetworksEnum.baseMainnet}-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`,
    }
    const query = {
      pluginAddress: '0x5EAd86cc058881EB1e8Ec023781AbbBB7d111bbD',
    }

    const stubCtrl = sandbox.stub(SettingController, 'getActiveSettingByDaoId').returns(true as any)

    const ctx: any = {
      params,
      query,
    }

    await SettingRouter.getActiveSettingByDaoId(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.daoId, query.pluginAddress)).to.be.true
  })

  it('Should getActiveSettingByDaoAddress', async () => {
    const params = {
      network: NetworksEnum.baseMainnet,
      daoAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }
    const query = {
      pluginAddress: '0x5EAd86cc058881EB1e8Ec023781AbbBB7d111bbD',
    }

    const stubCtrl = sandbox.stub(SettingController, 'getActiveSettingByDaoAddress').returns(true as any)

    const ctx: any = {
      params,
      query,
    }

    await SettingRouter.getActiveSettingByDaoAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.daoAddress, params.network, query.pluginAddress)).to.be.true
  })
})
