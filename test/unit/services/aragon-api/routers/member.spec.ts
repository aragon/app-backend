import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberRouter from '@services/aragon-api/routers/member'
import MemberController from '@services/aragon-api/controllers/member'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('Router: Member', () => {
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
      query: {},
    }

    await MemberRouter.getMemberByAddress(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(getAddress(params.address) as any)).to.be.true
  })
})
