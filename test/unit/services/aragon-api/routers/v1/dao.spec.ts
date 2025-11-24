import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoRouter from '@api/routers/v1/dao'
import DaoController from '@api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'

describe('RouterV1: Dao', () => {
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
        networks: [NetworksEnum.ethereumMainnet, NetworksEnum.ethereumSepolia],
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
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
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })

    it('Should get dao with pagination - all string params', async () => {
      const filterParams = {
        networks: 'ethereum-mainnet,ethereum-sepolia',
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
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
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]?.networks?.toString()).to.eq(filterParams.networks)
      expect(stubCtrl.args[0][1]?.address).to.eq(filterParams.address)
      expect(stubCtrl.args[0][1]?.pluginAddress).to.eq(filterParams.pluginAddress)
    })

    it('Should get dao with pagination - wrong string params', async () => {
      const filterParams = {
        networks: 'ethereum-mainnet,ethereum-test',
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
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

      await expect(DaoRouter.getWithPagination(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })

    it('Should get dao with pagination - missing pagination params', async () => {
      const filterParams = {
        networks: NetworksEnum.ethereumMainnet,
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
        ...{ networks: [filterParams.networks] },
        ...{
          address: undefined,
          pluginAddress: undefined,
        },
      })
    })
  })

  it('Should getDaoById', async () => {
    const daoId = 'ethereum-mainnet-0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    const params = {
      id: daoId,
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoById').returns(true as any)

    const ctx: any = {
      params,
    }

    await DaoRouter.getDaoById(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(daoId)).to.be.true
  })

  it('Should getDaoByAddress', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByAddress').returns(true as any)

    const ctx: any = {
      params,
    }

    await DaoRouter.getDaoByAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.address, params.network)).to.be.true
  })

  it('should get daos by member address', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaosByMember').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await DaoRouter.getDaoByMemberAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
  })

  it('should get daos by member address with networks filter', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }
    const filterParams = {
      networks: [NetworksEnum.ethereumMainnet, NetworksEnum.ethereumSepolia],
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaosByMember').returns(true as any)

    const ctx: any = {
      params,
      query: { ...filterParams },
    }

    await DaoRouter.getDaoByMemberAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][1]).to.deep.eq({
      network: undefined,
      networks: filterParams.networks,
      excludeDaoId: undefined,
      memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    })
  })

  it('should get daos by member address with networks filter in CSV format', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }
    const filterParams = {
      networks: `${NetworksEnum.ethereumMainnet},${NetworksEnum.ethereumSepolia}`,
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaosByMember').returns(true as any)

    const ctx: any = {
      params,
      query: { ...filterParams },
    }

    await DaoRouter.getDaoByMemberAddress(ctx)
    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][1]).to.deep.eq({
      network: undefined,
      // Joi validation turns csv string into an array!
      networks: [NetworksEnum.ethereumMainnet, NetworksEnum.ethereumSepolia],
      excludeDaoId: undefined,
      memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    })
  })

  it('Should getDaoByEns', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      ens: 'test-dao.eth',
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByEns').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await DaoRouter.getDaoByEns(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.ens, params.network)).to.be.true
  })

  it('should throw an error for invalid ENS format', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      ens: 'invalid-ens', // Missing .eth suffix
    }

    const stubCtrl = sandbox.stub(DaoController, 'getDaoByEns').returns(true as any)

    const ctx: any = {
      params,
      query: {},
    }

    await expect(DaoRouter.getDaoByEns(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
    expect(stubCtrl.notCalled).to.be.true
  })
})
