import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProposalRouter from '@services/aragon-api/routers/proposal'
import ProposalController from '@services/aragon-api/controllers/proposal'
import { NetworksEnum } from '@types'

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
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
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
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq(filterParams)
    })

    it('Should get proposal with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
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
        ...{ daoAddress: undefined, pluginAddress: undefined, creatorAddress: undefined },
      })
    })
  })
})
