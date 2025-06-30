import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberRouter from '@api/routers/v1/member'
import MemberController from '@api/controllers/member'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'
import MemberSchema from '@api/routers/schema/member'
import PaginationSchema from '@api/routers/schema/pagination'
import ValidationSchema from '@helpers/validationSchema'

describe('RouterV1: Member', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getMembersWithPagination', async () => {
    it('Should get member with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        tokenAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMembersWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await MemberRouter.getMembersWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'votingPower',
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })

    it('Should get member with pagination - daoId', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMembersWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await MemberRouter.getMembersWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'votingPower',
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: filterParams.network,
        daoAddress: undefined,
        pluginAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: filterParams.daoId })
    })

    it('Should get member with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMembersWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await MemberRouter.getMembersWithPagination(ctx)

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
        ...{ daoAddress: undefined, pluginAddress: undefined, tokenAddress: undefined },
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })
  })

  it('Should getMemberByAddress using address', async () => {
    const params = {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(MemberController, 'getMemberByAddress').returns(true as any)

    const ctx: any = {
      params,
      query: {
        network: NetworksEnum.ethereumMainnet,
      },
    }

    await MemberRouter.getMemberByAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(getAddress(params.address) as any)).to.be.true
  })

  it('Should check if a member is part of a plugin', async () => {
    const params = {
      memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      pluginAddress: '0xPluginAddress123',
    }

    const ctx: any = {
      params,
      query: {},
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(params)

    const stubCtrl = sandbox.stub(MemberController, 'isMemberOfPlugin').resolves(true as any)

    await MemberRouter.isMemberOfPlugin(ctx)

    expect(validateParamsStub.calledTwice).to.be.true
    expect(validateParamsStub.calledWith(MemberSchema.isMemberOfPlugin, params)).to.be.true
    expect(validateParamsStub.calledWith(PaginationSchema.getNotAllowedParams, {})).to.be.true

    expect(stubCtrl.calledOnceWith(params.memberAddress, params.pluginAddress)).to.be.true // Ensure the controller is called correctly
    expect(ctx.body).to.eq(true)
  })

  describe('getMemberLocks', () => {
    it('Should get member locks with all parameters', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        escrowAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
        onlyActive: 'true',
        pageSize: '20',
        page: '2',
        order: 'asc',
      }

      const expectedResponse = {
        data: [],
        metadata: {
          page: 2,
          totalPages: 1,
          totalRecords: 0,
        },
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves(expectedResponse as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(ctx.body).to.deep.eq(expectedResponse)
      expect(stubCtrl.calledOnce).to.be.true

      // Check extraParams
      const expectedExtraParams = {
        memberAddress: getAddress(memberAddress),
        escrowAddress: getAddress(queryParams.escrowAddress),
        network: queryParams.network,
        onlyActive: true,
      }

      // Check paginationParams
      const expectedPaginationParams = {
        pageSize: 20,
        page: 2,
        order: 'asc',
        sort: 'blockNumber', // default sort
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq(expectedExtraParams)
      expect(stubCtrl.args[0][1]).to.deep.eq(expectedPaginationParams)
    })

    it('Should get member locks with minimal parameters (using defaults)', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        network: NetworksEnum.polygonMainnet,
      }

      const expectedResponse = {
        data: [],
        metadata: {
          page: 1,
          totalPages: 0,
          totalRecords: 0,
        },
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves(expectedResponse as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(ctx.body).to.deep.eq(expectedResponse)
      expect(stubCtrl.calledOnce).to.be.true

      // Check extraParams
      const expectedExtraParams = {
        memberAddress: getAddress(memberAddress),
        escrowAddress: undefined,
        network: queryParams.network,
        onlyActive: undefined,
      }

      // Check paginationParams with defaults
      const expectedPaginationParams = {
        pageSize: 10, // default
        page: 1, // default
        order: 'desc', // default
        sort: 'blockNumber', // default sort for getMemberLocks
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq(expectedExtraParams)
      expect(stubCtrl.args[0][1]).to.deep.eq(expectedPaginationParams)
    })

    it('Should get member locks with onlyActive false', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        network: NetworksEnum.arbitrumMainnet,
        onlyActive: 'false',
        sort: 'createdAt',
      }

      const expectedResponse = {
        data: [
          {
            id: '1',
            memberAddress,
            amount: '1000',
            isActive: false,
          },
        ],
        metadata: {
          page: 1,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves(expectedResponse as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(ctx.body).to.deep.eq(expectedResponse)
      expect(stubCtrl.calledOnce).to.be.true

      // Check extraParams
      const expectedExtraParams = {
        memberAddress: getAddress(memberAddress),
        escrowAddress: undefined,
        network: queryParams.network,
        onlyActive: false,
      }

      // Check paginationParams
      const expectedPaginationParams = {
        pageSize: 10, // default
        page: 1, // default
        order: 'desc', // default
        sort: 'createdAt', // provided sort
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq(expectedExtraParams)
      expect(stubCtrl.args[0][1]).to.deep.eq(expectedPaginationParams)
    })

    it('Should handle validation and call controller with formatted params', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        escrowAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
      }

      const formattedExtraParams = {
        memberAddress: getAddress(memberAddress),
        escrowAddress: getAddress(queryParams.escrowAddress),
        network: queryParams.network,
        onlyActive: undefined,
      }

      const formattedPaginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'blockNumber',
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }

      const validateParamsStub = sandbox
        .stub(ValidationSchema, 'validateParams')
        .onFirstCall()
        .resolves(formattedExtraParams)
        .onSecondCall()
        .resolves(formattedPaginationParams)
        .onThirdCall()
        .resolves({})

      const expectedResponse = { data: [], metadata: { page: 1, totalPages: 0, totalRecords: 0 } }
      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves(expectedResponse as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(validateParamsStub.calledThrice).to.be.true
      expect(validateParamsStub.calledWith(MemberSchema.getMemberLocksParams)).to.be.true
      expect(validateParamsStub.calledWith(PaginationSchema.getPagination)).to.be.true
      expect(validateParamsStub.calledWith(PaginationSchema.getNotAllowedParams)).to.be.true

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.calledWith(formattedExtraParams, formattedPaginationParams)).to.be.true
      expect(ctx.body).to.deep.eq(expectedResponse)
    })
  })
})
