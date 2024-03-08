import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import MainRouter from '@services/api/routers/index'
import StatusRouter from '@services/api/routers/status'
import DaoRouter from '@services/api/routers/dao'
import utils from '@helpers/utils'

describe('Router: MainRouter', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should get main router', async () => {
    const use = sandbox.stub(Router.prototype, 'use')

    function stubRouter(Rt: any, name: string) {
      return sandbox.stub(Rt, 'router').returns({
        routes: sandbox.stub().returns(`${name}Routes`),
        allowedMethods: sandbox.stub().returns(`${name}AllowedMethod`),
      })
    }

    stubRouter(DaoRouter, 'dao')
    stubRouter(StatusRouter, 'status')

    await utils.wait(1000)

    const mainRouter = MainRouter.router()
    expect(mainRouter instanceof Router).to.be.true

    expect(use.callCount).to.be.eq(2)
    expect(use.calledWith(`statusRoutes`, `statusAllowedMethod`)).to.be.true

    function expectRouter(name: string) {
      expect(
        use.calledWith(`/${name}`, `${name}Routes`, `${name}AllowedMethod`),
      ).to.be.true
    }

    expectRouter('dao')
  })
})
