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
        offset: 1,
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
        offset: 1,
        order: 'desc',
      }
      expect(stubCtrl.calledWith(fakeRes as any)).to.be.true
    })
  })
})
