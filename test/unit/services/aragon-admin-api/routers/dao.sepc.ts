import * as sinon from 'sinon'
import { expect } from 'chai'
import DaoAdminRouter from '@services/aragon-admin-api/routers/dao'
import DaoAdminController from '@services/aragon-admin-api/controllers/dao'
import { NetworksEnum } from '@types'

describe('Router: DaoAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('setVisibilityStatus', () => {
    it('should call controller with status true and set isHidden false', async () => {
      const params = {
        daoAddress: '0x15C6AC4Cf1b5E49c44332Fb0a1043Ccab19db80a',
        network: NetworksEnum.ethereumMainnet,
        status: 'true',
      }

      const stubController = sandbox.stub(DaoAdminController, 'setVisibilityStatus').resolves(true)

      const ctx: any = {
        params,
      }

      await DaoAdminRouter.setVisibilityStatus(ctx)

      expect(ctx.body).to.equal(true)
      expect(stubController.calledOnce).to.be.true
      expect(stubController.firstCall.args[0]).to.deep.equal({
        address: params.daoAddress,
        network: params.network,
        status: true,
      })
    })

    it('should call controller with status false and set isHidden true', async () => {
      const params = {
        daoAddress: '0x15C6AC4Cf1b5E49c44332Fb0a1043Ccab19db80a',
        network: NetworksEnum.ethereumMainnet,
        status: 'false',
      }

      const stubController = sandbox.stub(DaoAdminController, 'setVisibilityStatus').resolves(true)

      const ctx: any = {
        params,
      }

      await DaoAdminRouter.setVisibilityStatus(ctx)

      expect(ctx.body).to.equal(true)
      expect(stubController.calledOnce).to.be.true
      expect(stubController.firstCall.args[0]).to.deep.equal({
        address: params.daoAddress,
        network: params.network,
        status: false,
      })
    })

    it('should throw if validation fails', async () => {
      const params = {
        daoAddress: 'invalid', // fails validation
        network: NetworksEnum.ethereumMainnet,
        status: 'yes', // not coercible to boolean
      }

      const stubController = sandbox.stub(DaoAdminController, 'setVisibilityStatus')

      const ctx: any = {
        params,
      }

      try {
        await DaoAdminRouter.setVisibilityStatus(ctx)
        expect.fail('Should throw validation error')
      } catch (err) {
        expect(stubController.called).to.be.false
      }
    })
  })
})
