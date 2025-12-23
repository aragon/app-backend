import VoteController from '@api/controllers/vote'
import VoteSchema from '@api/routers/schema/vote'
import VoteRouter from '@api/routers/v1/vote'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as _ from 'lodash'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV1: Vote', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get vote with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        tokenAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        includeInfo: true,
        highlightUser: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

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

      const pairParams = {
        daoId: undefined,
        ens: undefined,
        proposalId: undefined,
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ..._.omit(filterParams, 'address'),
        ...{ memberAddress: filterParams.address },
      })
      expect(stubCtrl.args[0][2]).to.deep.eq(pairParams)
    })

    it('Should get vote with pagination - ens', async () => {
      const filterParams = {
        daoId: undefined,
        ens: 'test.dao.eth',
        proposalId: undefined,
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

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
        highlightUser: undefined,
        daoAddress: undefined,
        pluginAddress: undefined,
        memberAddress: undefined,
        tokenAddress: undefined,
        includeInfo: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq(filterParams)
    })

    it('Should get vote with pagination - missing pagination params', async () => {
      const filterParams = {
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

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
        ...{
          memberAddress: filterParams.address,
          daoAddress: undefined,
          pluginAddress: undefined,
          tokenAddress: undefined,
          network: undefined,
          includeInfo: undefined,
          highlightUser: undefined,
        },
      })
    })
  })

  it('Should get member vote info', async () => {
    const ctx: any = {
      query: {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0xPluginAddress123',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      },
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(ctx.query)

    const stubCtrl = sandbox.stub(VoteController, 'memberVotesInfo').resolves({
      voted: true,
      vote: 'YES',
      votingPower: 1000,
    } as any)

    await VoteRouter.getMemberVoteInfo(ctx)

    expect(validateParamsStub.calledOnce).to.be.true
    expect(
      validateParamsStub.calledWith(VoteSchema.canVote, {
        memberAddress: ctx.query.memberAddress,
        pluginAddress: ctx.query.pluginAddress,
        proposalIndex: ctx.query.proposalIndex,
        network: ctx.query.network,
      }),
    ).to.be.true

    expect(stubCtrl.calledOnceWith(ctx.query)).to.be.true
    expect(ctx.body).to.deep.eq({
      voted: true,
      vote: 'YES',
      votingPower: 1000,
    })
  })
})
