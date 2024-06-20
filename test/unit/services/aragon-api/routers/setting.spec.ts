import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SettingRouter from '@services/aragon-api/routers/setting'
import SettingController from '@services/aragon-api/controllers/setting'
import { NetworksEnum } from '@types'

describe('Router: Setting', () => {
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
        onlyActive: true,
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
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'amountUsd',
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: undefined,
        daoAddress: undefined,
        pluginAddress: undefined,
        onlyActive: undefined,
      })
      expect(stubCtrl.args[0][2]).to.eq(filterParams.daoId)
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
        ...{ daoAddress: undefined, pluginAddress: undefined, onlyActive: undefined },
      })
    })
  })

  it('Should getSettingById', async () => {
    const params = {
      id: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(SettingController, 'getSettingById').returns(true as any)

    const ctx: any = {
      params,
    }

    await SettingRouter.getSettingById(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.id)).to.be.true
  })

  it('Should getSettingByTransactionHash', async () => {
    const params = {
      network: NetworksEnum.baseMainnet,
      transactionHash: '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
    }

    const stubCtrl = sandbox.stub(SettingController, 'getSettingByTransactionHash').returns(true as any)

    const ctx: any = {
      params,
    }

    await SettingRouter.getSettingByTransactionHash(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.transactionHash, params.network)).to.be.true
  })
})
