import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SettingRouter from '@api/routers/v2/setting'
import SettingController from '@api/controllers/setting'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('RouterV2: Setting', () => {
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
        pageSize: '10',
        page: '1',
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

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        daoAddress: getAddress(filterParams.daoAddress),
        pluginAddress: getAddress(filterParams.pluginAddress),
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({ daoId: undefined })
    })

    it('Should get setting with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: '10',
        page: '1',
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

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: undefined,
        daoAddress: undefined,
        pluginAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({ daoId: filterParams.daoId })
    })

    it('Should get setting with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
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
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        daoAddress: getAddress(filterParams.daoAddress),
        pluginAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({ daoId: undefined })
    })

    it('Should fail validation when neither daoId nor network with daoAddress is provided', async () => {
      const ctx: any = {
        query: {
          pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        },
      }

      let error: any
      try {
        await SettingRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should fail validation when network is provided without daoAddress', async () => {
      const ctx: any = {
        query: {
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        },
      }

      let error: any
      try {
        await SettingRouter.getWithPagination(ctx)
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
        daoAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        pluginAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        tokenAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getSettingsWithPagination').returns(true as any)

      const ctx: any = {
        query: filterParams,
      }

      await SettingRouter.getWithPagination(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        daoAddress: getAddress(filterParams.daoAddress),
        pluginAddress: getAddress(filterParams.pluginAddress),
        tokenAddress: getAddress(filterParams.tokenAddress),
      })
    })
  })

  describe('getActiveSettingByDaoId', () => {
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
      expect(stubCtrl.args[0]?.[0]).to.eq(params.daoId)
      expect(stubCtrl.args[0]?.[1]).to.eq(getAddress(query.pluginAddress))
    })

    it('Should handle lowercase pluginAddress and checksum it', async () => {
      const params = {
        daoId: `${NetworksEnum.baseMainnet}-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`,
      }
      const query = {
        pluginAddress: '0x5ead86cc058881eb1e8ec023781abbbb7d111bbd',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getActiveSettingByDaoId').returns(true as any)

      const ctx: any = {
        params,
        query,
      }

      await SettingRouter.getActiveSettingByDaoId(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.eq(params.daoId)
      expect(stubCtrl.args[0]?.[1]).to.eq(getAddress(query.pluginAddress))
    })

    it('Should fail validation when pluginAddress is missing', async () => {
      const params = {
        daoId: `${NetworksEnum.baseMainnet}-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`,
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoId(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is required')
    })

    it('Should fail validation when pluginAddress is invalid', async () => {
      const params = {
        daoId: `${NetworksEnum.baseMainnet}-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`,
      }
      const query = {
        pluginAddress: '0xinvalid',
      }

      const ctx: any = {
        params,
        query,
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoId(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is not a valid address')
    })
  })

  describe('getActiveSettingByDaoAddress', () => {
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
      expect(stubCtrl.args[0]?.[0]).to.eq(getAddress(params.daoAddress))
      expect(stubCtrl.args[0]?.[1]).to.eq(params.network)
      expect(stubCtrl.args[0]?.[2]).to.eq(getAddress(query.pluginAddress))
    })

    it('Should handle lowercase addresses and checksum them', async () => {
      const params = {
        network: NetworksEnum.baseMainnet,
        daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      }
      const query = {
        pluginAddress: '0x5ead86cc058881eb1e8ec023781abbbb7d111bbd',
      }

      const stubCtrl = sandbox.stub(SettingController, 'getActiveSettingByDaoAddress').returns(true as any)

      const ctx: any = {
        params,
        query,
      }

      await SettingRouter.getActiveSettingByDaoAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.eq(getAddress(params.daoAddress))
      expect(stubCtrl.args[0]?.[1]).to.eq(params.network)
      expect(stubCtrl.args[0]?.[2]).to.eq(getAddress(query.pluginAddress))
    })

    it('Should fail validation when network is invalid', async () => {
      const params = {
        network: 'invalid-network',
        daoAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }
      const query = {
        pluginAddress: '0x5EAd86cc058881EB1e8Ec023781AbbBB7d111bbD',
      }

      const ctx: any = {
        params,
        query,
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('Should fail validation when daoAddress is invalid', async () => {
      const params = {
        network: NetworksEnum.baseMainnet,
        daoAddress: '0xinvalid',
      }
      const query = {
        pluginAddress: '0x5EAd86cc058881EB1e8Ec023781AbbBB7d111bbD',
      }

      const ctx: any = {
        params,
        query,
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"daoAddress" is not a valid address')
    })

    it('Should fail validation when pluginAddress is missing', async () => {
      const params = {
        network: NetworksEnum.baseMainnet,
        daoAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is required')
    })

    it('Should fail validation when pluginAddress is invalid', async () => {
      const params = {
        network: NetworksEnum.baseMainnet,
        daoAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }
      const query = {
        pluginAddress: '0xinvalid',
      }

      const ctx: any = {
        params,
        query,
      }

      let error: any
      try {
        await SettingRouter.getActiveSettingByDaoAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is not a valid address')
    })
  })
})
