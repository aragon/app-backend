import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoRouter from '@services/api/routers/dao'
import DaoController from '@services/api/controllers/dao'
import { NetworksEnum, EnumPluginType } from '@types'

describe('Router: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get dao with pagination - all params', async () => {
      const params = {
        network: NetworksEnum.ethereum,
        plugin: EnumPluginType.MultisigPlugin,
        limit: 10,
        skip: 1,
        order: 'asc',
        orderProp: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getWithPagination').returns(true as any)

      const ctx: any = {
        query: params,
      }

      await DaoRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const fakeRes = {
        ...params,
        search: undefined,
        fromDate: undefined,
        toDate: undefined,
      }
      expect(stubCtrl.calledWith(fakeRes as any)).to.be.true
    })

    it('Should get dao with pagination - missing pagination params', async () => {
      const params = {
        network: NetworksEnum.ethereum,
        plugin: EnumPluginType.MultisigPlugin,
        orderProp: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getWithPagination').returns(true as any)

      const ctx: any = {
        query: params,
      }

      await DaoRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const fakeRes = {
        ...params,
        search: undefined,
        fromDate: undefined,
        toDate: undefined,
        limit: 10,
        skip: 0,
        order: 'desc',
      }
      expect(stubCtrl.calledWith(fakeRes as any)).to.be.true
    })
  })

  describe('getDaoByAddressAndNetwork', async () => {
    it('Should get dao', async () => {
      const params = {
        network: NetworksEnum.ethereum,
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDao').returns(true as any)

      const ctx: any = {
        params,
      }

      await DaoRouter.getDaoByAddressAndNetwork(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith(params.network, params.address as any)).to.be.true
    })
  })

  describe('getDaoMembersMultiSigWithPagination', async () => {
    it('Should get daoMembersMultiSigWithPagination', async () => {
      const params = {
        network: NetworksEnum.ethereum,
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }

      const filterParams = {
        limit: 10,
        skip: 0,
        order: 'desc',
        orderProp: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoMembersMultiSig').returns(true as any)

      const ctx: any = {
        params,
        query: filterParams,
      }

      await DaoRouter.getDaoMembersMultiSigWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith(params.network, params.address as any, filterParams)).to.be.true
    })
  })

  describe('getDaoMembersTokenVotingWithPagination', async () => {
    it('Should get getDaoMembersTokenVotingWithPagination', async () => {
      const params = {
        network: NetworksEnum.ethereum,
        address: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }

      const filterParams = {
        limit: 10,
        skip: 0,
        order: 'desc',
        orderProp: 'createdAt',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoMembersTokenVoting').returns(true as any)

      const ctx: any = {
        params,
        query: filterParams,
      }

      await DaoRouter.getDaoMembersTokenVotingWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith(params.network, params.address as any, filterParams)).to.be.true
    })
  })
})
