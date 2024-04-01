import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoRouter from '@services/api/routers/dao'
import DaoController from '@services/api/controllers/dao'
import { NetworksEnum, EnumPluginType, HexAddress } from '@types'

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

  describe('getDaoByPermalink', async () => {
    it('Should get dao', async () => {
      const params = {
        permalink: 'xxx',
      }

      const stubCtrl = sandbox.stub(DaoController, 'getDaoByPermalink').returns(true as any)

      const ctx: any = {
        params,
      }

      await DaoRouter.getDaoByPermalink(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.calledWith(params.permalink)).to.be.true
    })
  })

  describe('getDaoMembersMultiSigWithPagination', async () => {
    it('Should get daoMembersMultiSigWithPagination', async () => {
      const params = {
        permalink: 'xxx',
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
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

      expect(stubCtrl.calledWith(params.permalink, params.pluginAddress as HexAddress, filterParams)).to.be.true
    })
  })

  describe('getDaoMembersTokenVotingWithPagination', async () => {
    it('Should get getDaoMembersTokenVotingWithPagination', async () => {
      const params = {
        permalink: 'xxx',
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
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

      expect(stubCtrl.calledWith(params.permalink, params.pluginAddress as HexAddress, filterParams)).to.be.true
    })
  })
})
