import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProposalRouter from '@api/routers/v1/proposal'
import ProposalController from '@api/controllers/proposal'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'
import ProposalSchema from '@api/routers/schema/proposal'
import ValidationSchema from '@helpers/validationSchema'

describe('Router: Proposal', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get proposal with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        creatorAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        daoInfo: false,
        isExecuted: false,
        isSubProposal: false,
        proposalIndex: '1',
        incrementalId: 1,
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const pairParams = {
        onlyActive: true,
        daoId: '0x0',
      }

      const stubCtrl = sandbox.stub(ProposalController, 'getProposalsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams, ...pairParams },
      }

      await ProposalRouter.getWithPagination(ctx)

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
      expect(stubCtrl.args[0][2]).to.deep.eq(pairParams)
    })

    it('Should get proposal with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        daoInfo: false,
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(ProposalController, 'getProposalsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await ProposalRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'incrementalId',
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: undefined,
        daoAddress: undefined,
        pluginAddress: undefined,
        creatorAddress: undefined,
        isSubProposal: undefined,
        daoInfo: false,
        isExecuted: undefined,
        incrementalId: undefined,
        proposalIndex: undefined,
      })
      expect(stubCtrl.args[0][2]?.daoId).to.deep.eq(filterParams.daoId)
    })

    it('Should get proposal with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        daoInfo: true,
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(ProposalController, 'getProposalsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await ProposalRouter.getWithPagination(ctx)

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
        ...{
          daoAddress: undefined,
          pluginAddress: undefined,
          creatorAddress: undefined,
          isExecuted: undefined,
          isSubProposal: undefined,
          proposalIndex: undefined,
          incrementalId: undefined,
        },
      })
    })
  })

  it('Should getProposalById', async () => {
    const params = {
      id: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(ProposalController, 'getProposalById').returns(true as any)

    const ctx: any = {
      params,
    }

    await ProposalRouter.getProposalById(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(getAddress(params.id) as any)).to.be.true
  })

  it('Should getProposalBySlug', async () => {
    const params = {
      slug: 'test-1',
    }

    const stubCtrl = sandbox.stub(ProposalController, 'getProposalBySlug').returns(true as any)

    const ctx: any = {
      params,
      query: { daoId: `${NetworksEnum.polygonMainnet}-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254` },
    }

    await ProposalRouter.getProposalBySlug(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(params.slug, ctx.query)).to.be.true
  })

  it('Should getProposalDecodedActions', async () => {
    const params = {
      id: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox.stub(ProposalController, 'getProposalDecodedActions').returns(true as any)

    const ctx: any = {
      params,
    }

    await ProposalRouter.getProposalDecodedActions(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.calledWith(getAddress(params.id) as any)).to.be.true
  })

  it('should canCastVote', async () => {
    const ctx: any = {
      query: { userAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
      params: {
        proposalId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      },
    }

    const stubCtrl = sandbox.stub(ProposalController, 'canCastVote').returns(true as any)

    await ProposalRouter.canCastVote(ctx)
    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(
      stubCtrl.calledWith({
        proposalId: ctx.params.proposalId,
        userAddress: ctx.query.userAddress,
      }),
    ).to.be.true
  })

  it('Should check if a member can create a proposal', async () => {
    const ctx: any = {
      query: {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0xPluginAddress123',
        network: NetworksEnum.ethereumMainnet,
      },
    }

    const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(ctx.query)

    const stubCtrl = sandbox.stub(ProposalController, 'canCreateProposal').resolves(true as any)

    await ProposalRouter.canCreateProposal(ctx)

    expect(validateParamsStub.calledOnce).to.be.true
    expect(
      validateParamsStub.calledWith(ProposalSchema.canCreateProposal, {
        memberAddress: ctx.query.memberAddress,
        pluginAddress: ctx.query.pluginAddress,
        network: ctx.query.network,
      }),
    ).to.be.true

    expect(stubCtrl.calledOnceWith(ctx.query)).to.be.true
    expect(ctx.body).to.eq(true)
  })
})
