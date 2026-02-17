import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoRouterV3 from '@api/routers/v3/dao'
import DaoController from '@api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'

describe('RouterV3: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should call getDaosWithPaginationWithoutPlugins', async () => {
      const filterParams = {
        networks: [NetworksEnum.ethereumMainnet, NetworksEnum.ethereumSepolia],
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaosWithPaginationWithoutPlugins').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DaoRouterV3.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
    })

    it('Should get dao with pagination without pluginAddress filter (WithoutPlugins does not use pluginAddress)', async () => {
      const filterParams = {
        networks: [NetworksEnum.ethereumMainnet],
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaosWithPaginationWithoutPlugins').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DaoRouterV3.getWithPagination(ctx)

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
    })
  })

  it('Should getDaoById using WithoutPlugins controller', async () => {
    const params = {
      id: 'ethereum-mainnet-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByIdWithoutPlugins').returns(true as any)

    const ctx: any = {
      query: {},
      params,
    }

    await DaoRouterV3.getDaoById(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.id, false)).to.be.true
  })

  it('Should getDaoByAddress using WithoutPlugins controller', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByAddressWithoutPlugins').returns(true as any)

    const ctx: any = {
      query: {},
      params,
    }

    await DaoRouterV3.getDaoByAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.address, params.network)).to.be.true
  })

  it('Should get daos by member address using WithoutPlugins controller', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaosByMemberWithoutPlugins').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await DaoRouterV3.getDaoByMemberAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
  })

  it('Should get daos by member address with networks filter using WithoutPlugins controller', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }
    const filterParams = {
      networks: [NetworksEnum.ethereumMainnet, NetworksEnum.ethereumSepolia],
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaosByMemberWithoutPlugins').returns(true as any)

    const ctx: any = {
      params,
      query: { ...filterParams },
    }

    await DaoRouterV3.getDaoByMemberAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][1]).to.deep.eq({
      networks: filterParams.networks,
      excludeDaoId: undefined,
      memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    })
  })

  it('Should getDaoByEns using WithoutPlugins controller', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      ens: 'test-dao.eth',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByEnsWithoutPlugins').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await DaoRouterV3.getDaoByEns(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.ens, params.network)).to.be.true
  })

  it('Should throw an error for invalid ENS format', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      ens: 'invalid-ens',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByEnsWithoutPlugins').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await expect(DaoRouterV3.getDaoByEns(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
    expect(stubCtrl.notCalled).to.be.true
  })
})
