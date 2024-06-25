import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import MainRouter from '@services/aragon-api/routers/index'
import StatusRouter from '@services/aragon-api/routers/status'
import DaoRouter from '@services/aragon-api/routers/dao'
import TokenRouter from '@services/aragon-api/routers/token'
import utils from '@helpers/utils'
import Koa from 'koa'
import supertest from 'supertest'
import AssetRouter from '@api/routers/asset'
import MemberRouter from '@api/routers/member'
import ProposalRouter from '@api/routers/proposal'
import SettingRouter from '@api/routers/setting'
import TransactionRouter from '@api/routers/transaction'
import DelegateRouter from '@api/routers/delegate'

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

    stubRouter(DelegateRouter, 'delegate')
    stubRouter(AssetRouter, 'assets')
    stubRouter(DaoRouter, 'daos')
    stubRouter(MemberRouter, 'members')
    stubRouter(ProposalRouter, 'proposals')
    stubRouter(SettingRouter, 'settings')
    stubRouter(TokenRouter, 'tokens')
    stubRouter(TransactionRouter, 'transactions')
    stubRouter(StatusRouter, 'status')

    await utils.wait(1000)

    const mainRouter = MainRouter.router()
    expect(mainRouter instanceof Router).to.be.true

    expect(use.callCount).to.be.eq(9)
    expect(use.calledWith(`statusRoutes`, `statusAllowedMethod`)).to.be.true

    function expectRouter(name: string) {
      expect(use.calledWith(`/${name}`, `${name}Routes`, `${name}AllowedMethod`)).to.be.true
    }

    expectRouter('delegate')
    expectRouter('assets')
    expectRouter('daos')
    expectRouter('members')
    expectRouter('proposals')
    expectRouter('settings')
    expectRouter('tokens')
    expectRouter('transactions')
  })

  it('Should setup main router with all child routers', async () => {
    const app = new Koa()
    app.use(MainRouter.router().routes())
    const request = supertest(app.callback())

    await request.get('/').expect(200)
  })
})
