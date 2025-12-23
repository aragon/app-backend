import MemberController from '@api/controllers/member'
import MemberRouter from '@api/routers/v2/member'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Member', () => {
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
      expect(stubCtrl.args[0][1]).to.deep.eq({ ...filterParams, lockManagerAddress: undefined })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })

    it('Should get member with pagination - daoId with pluginAddress', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
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
        network: undefined,
        daoAddress: undefined,
        pluginAddress: filterParams.pluginAddress,
        tokenAddress: undefined,
        lockManagerAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: filterParams.daoId })
    })

    it('Should get member with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
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
        ...{ pluginAddress: filterParams.pluginAddress, tokenAddress: undefined, lockManagerAddress: undefined },
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })

    it('Should fail validation when pluginAddress is missing', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        // Missing required pluginAddress
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
      }

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      try {
        await MemberRouter.getMembersWithPagination(ctx)
        expect.fail('Should have thrown validation error')
      } catch (error: any) {
        expect(error.message).to.include('badParams')
      }
    })

    it('Should fail validation when neither daoId nor network with daoAddress is provided', async () => {
      const filterParams = {
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        // No daoId and no network+daoAddress
      }

      const ctx: any = {
        query: filterParams,
      }

      let error: any
      try {
        await MemberRouter.getMembersWithPagination(ctx)
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
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        // No daoAddress
      }

      const ctx: any = {
        query: filterParams,
      }

      let error: any
      try {
        await MemberRouter.getMembersWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })
  })

  describe('getMemberByAddress', () => {
    it('Should getMemberByAddress with network and pluginAddress', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }
      const queryParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberByAddress').returns(true as any)

      const ctx: any = {
        params,
        query: queryParams,
      }

      await MemberRouter.getMemberByAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.eq(getAddress(params.address))
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: queryParams.network,
        pluginAddress: getAddress(queryParams.pluginAddress),
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })

    it('Should getMemberByAddress with network and tokenAddress', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }
      const queryParams = {
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberByAddress').returns(true as any)

      const ctx: any = {
        params,
        query: queryParams,
      }

      await MemberRouter.getMemberByAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.eq(getAddress(params.address))
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: queryParams.network,
        pluginAddress: undefined,
        tokenAddress: getAddress(queryParams.tokenAddress),
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: undefined })
    })

    it('Should getMemberByAddress with daoId', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }
      const queryParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberByAddress').returns(true as any)

      const ctx: any = {
        params,
        query: queryParams,
      }

      await MemberRouter.getMemberByAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.eq(getAddress(params.address))
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: undefined,
        pluginAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq({ daoId: queryParams.daoId })
    })

    it('Should fail validation when neither daoId nor network with address is provided', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const ctx: any = {
        params,
        query: {}, // No daoId, no network
      }

      let error: any
      try {
        await MemberRouter.getMemberByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should fail validation when network is provided without pluginAddress or tokenAddress', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const ctx: any = {
        params,
        query: {
          network: NetworksEnum.ethereumMainnet,
          // No pluginAddress or tokenAddress
        },
      }

      let error: any
      try {
        await MemberRouter.getMemberByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })
  })

  describe('isMemberOfPlugin', () => {
    it('Should check if a member is part of a plugin', async () => {
      const params = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const queryParams = {
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(MemberController, 'isMemberOfPlugin').resolves(true)

      const ctx: any = {
        params,
        query: queryParams,
      }

      await MemberRouter.isMemberOfPlugin(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.eq(getAddress(params.memberAddress))
      expect(stubCtrl.args[0][1]).to.eq(getAddress(params.pluginAddress))
      expect(stubCtrl.args[0][2]).to.eq(queryParams.network)
      expect(ctx.body).to.deep.eq({ status: true })
    })

    it('Should fail validation when network is missing', async () => {
      const params = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }

      const ctx: any = {
        params,
        query: {}, // No network - should fail if required by schema
      }

      let error: any
      try {
        await MemberRouter.isMemberOfPlugin(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })
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

    it('Should handle invalid boolean value for onlyActive', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        network: NetworksEnum.ethereumMainnet,
        onlyActive: 'invalid',
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves({ data: [], metadata: {} } as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      // Note: Utils.parseBoolean returns false for invalid values (not undefined)
      expect(stubCtrl.args[0][0]?.onlyActive).to.be.false
    })

    it('Should handle undefined onlyActive parameter', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const queryParams = {
        network: NetworksEnum.ethereumMainnet,
        // onlyActive not provided
      }

      const stubCtrl = sandbox.stub(MemberController, 'getMemberLocks').resolves({ data: [], metadata: {} } as any)

      const ctx: any = {
        params: { address: memberAddress },
        query: queryParams,
      }

      await MemberRouter.getMemberLocks(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      // When onlyActive is not provided, it should be undefined
      expect(stubCtrl.args[0][0]?.onlyActive).to.be.undefined
    })

    it('Should fail validation when network parameter is missing', async () => {
      const memberAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

      const ctx: any = {
        params: { address: memberAddress },
        query: {}, // No network - should fail if required by schema
      }

      let error: any
      try {
        await MemberRouter.getMemberLocks(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })
  })
})
