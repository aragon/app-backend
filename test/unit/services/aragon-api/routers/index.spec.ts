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
import VoteRouter from '@api/routers/vote'
import Contract from '@api/routers/contract'
import PluginRouter from '@api/routers/plugins'

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

    stubRouter(VoteRouter, 'votes')
    stubRouter(DelegateRouter, 'delegates')
    stubRouter(AssetRouter, 'assets')
    stubRouter(DaoRouter, 'daos')
    stubRouter(MemberRouter, 'members')
    stubRouter(ProposalRouter, 'proposals')
    stubRouter(SettingRouter, 'settings')
    stubRouter(TokenRouter, 'tokens')
    stubRouter(TransactionRouter, 'transactions')
    stubRouter(StatusRouter, 'status')
    stubRouter(Contract, 'contract')
    stubRouter(PluginRouter, 'plugins')

    await utils.wait(1000)

    const mainRouter = MainRouter.router()
    expect(mainRouter instanceof Router).to.be.true

    expect(use.callCount).to.be.eq(12)
    expect(use.calledWith(`statusRoutes`, `statusAllowedMethod`)).to.be.true

    function expectRouter(name: string) {
      expect(use.calledWith(`/${name}`, `${name}Routes`, `${name}AllowedMethod`)).to.be.true
    }

    expectRouter('votes')
    expectRouter('delegates')
    expectRouter('assets')
    expectRouter('daos')
    expectRouter('members')
    expectRouter('proposals')
    expectRouter('settings')
    expectRouter('tokens')
    expectRouter('transactions')
    expectRouter('contract')
    expectRouter('plugins')
  })

  it('Should setup main router with all child routers', async () => {
    const app = new Koa()
    app.use(MainRouter.router().routes())
    const request = supertest(app.callback())

    await request.get('/').expect(200)
  })
})
