import PolicyController from '@api/controllers/policy'
import PolicyRouter from '@api/routers/v2/policy'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Policy', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getPoliciesByDao', () => {
    const validDaoAddress = '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA'

    it('should call controller with correct params', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const stubCtrl = sandbox.stub(PolicyController, 'getPoliciesByDao').resolves(mockPolicies as any)

      const ctx: any = {
        params: {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: validDaoAddress,
        },
        query: {},
      }

      await PolicyRouter.getPoliciesByDao(ctx)

      expect(ctx.body).to.deep.eq(mockPolicies)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        daoAddress: validDaoAddress,
        onlyParent: false,
      })
    })

    it('should handle onlyParent true', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const stubCtrl = sandbox.stub(PolicyController, 'getPoliciesByDao').resolves(mockPolicies as any)

      const ctx: any = {
        params: {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: validDaoAddress,
        },
        query: {
          onlyParent: 'true',
        },
      }

      await PolicyRouter.getPoliciesByDao(ctx)

      expect(ctx.body).to.deep.eq(mockPolicies)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0].onlyParent).to.be.true
    })

    it('should handle onlyParent false when not provided', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const stubCtrl = sandbox.stub(PolicyController, 'getPoliciesByDao').resolves(mockPolicies as any)

      const ctx: any = {
        params: {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: validDaoAddress,
        },
        query: {
          onlyParent: 'false',
        },
      }

      await PolicyRouter.getPoliciesByDao(ctx)

      expect(stubCtrl.args[0][0].onlyParent).to.be.false
    })
  })

  describe('router', () => {
    it('should return a router with getPoliciesByDao route', () => {
      const router = PolicyRouter.router()

      expect(router).to.not.be.undefined
      expect(router.stack.length).to.be.greaterThan(0)
      expect(router.stack[0].path).to.eq('/:network/:daoAddress')
      expect(router.stack[0].methods).to.include('GET')
    })
  })
})
