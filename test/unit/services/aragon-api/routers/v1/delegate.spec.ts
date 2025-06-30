import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DelegateRouter from '@api/routers/v1/delegate'
import DelegateController from '@api/controllers/delegate'
import { ITransferSide, ITransferType, NetworksEnum } from '@types'
import * as _ from 'lodash'

describe('RouterV1: Delegate', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get delegate with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        tokenAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        type: ITransferType.delegate,
        side: ITransferSide.incoming,
        excludeZeroAddress: false,
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(DelegateController, 'getDelegateWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DelegateRouter.getWithPagination(ctx)

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
        ..._.omit(filterParams, 'address'),
        ...{ memberAddress: filterParams.address },
      })
    })

    it('Should get proposal with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(DelegateController, 'getDelegateWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DelegateRouter.getWithPagination(ctx)

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
        daoAddress: undefined,
        pluginAddress: undefined,
        memberAddress: undefined,
        tokenAddress: undefined,
        type: undefined,
        side: undefined,
        excludeZeroAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq(filterParams)
    })

    it('Should get delegate with pagination - missing pagination params', async () => {
      const filterParams = {
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DelegateController, 'getDelegateWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await DelegateRouter.getWithPagination(ctx)

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
          type: undefined,
          side: undefined,
          excludeZeroAddress: undefined,
        },
      })
    })
  })
})
