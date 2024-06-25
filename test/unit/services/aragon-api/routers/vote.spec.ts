import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteRouter from '@services/aragon-api/routers/vote'
import VoteController from '@services/aragon-api/controllers/vote'
import { NetworksEnum } from '@types'

describe('Router: Vote', () => {
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
        proposalId: '1',
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
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'blockNumber',
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({ ...filterParams, ...{ proposalId: 1 } })
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
        ...{
          daoAddress: undefined,
          pluginAddress: undefined,
          tokenAddress: undefined,
          network: undefined,
          proposalId: undefined,
        },
      })
    })
  })
})
