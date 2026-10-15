import MainAdminRouter from '@admin-api/routers/index'
import SafeAdminController from '@admin-api/controllers/safe'
import { Models } from '@dbModels'
import JwtHelper from '@helpers/jwt'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ErrorMiddleware from '@middlewares/error'
import { SafeReadError } from '@modules/safe/safeError'
import {
  EnumQueueName,
  ErrorKeyEnum,
  IJwtAuthType,
  IPluginInterfaceType,
  IPluginStatus,
  ISafeErrorCode,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import supertest from 'supertest'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const path = `/safes/${NETWORK}/${SAFE}`
const DAO = '0x3333333333333333333333333333333333333333'
const SPP = '0x4444444444444444444444444444444444444444'
const REMOVE_MESSAGE = 'The Safe belongs to a DAO or SPP, only a custom Safe can be removed'

const createApp = (admin = true) => {
  const app = new Koa()
  app.use(ErrorMiddleware())
  app.use(async (ctx, next) => {
    if (admin) {
      ctx.state[JwtHelper.JWT_KEY] = { token: 'admin' }
      ctx.state.token = { type: IJwtAuthType.auth, updateOnly: async () => {} }
    }
    await next()
  })
  const router = MainAdminRouter.router()
  app.use(router.routes()).use(router.allowedMethods())
  return app
}

describe('Router: SafeAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
  })

  afterEach(() => sandbox.restore())

  it('returns 400 when removing an unknown Safe', async () => {
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    const response = await supertest(createApp().callback()).delete(path)

    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    expect(response.status).to.equal(400)
    expect(response.body.code).to.equal(ErrorKeyEnum.notFound)
    expect(send.notCalled).to.be.true
  })

  it('returns 502 without registering a Safe when the gateway does not reply', async () => {
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

    const response = await supertest(createApp().callback()).post(path)

    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    expect(send.calledOnce).to.be.true
    expect(send.firstCall.args[0]).to.equal(EnumQueueName.safeRead)
    expect(response.status).to.equal(502)
  })

  for (const method of ['post', 'delete'] as const) {
    it(`requires an admin for ${method}`, async () => {
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const response = await supertest(createApp(false).callback())[method](path)

      expect(response.body.code).to.equal(ErrorKeyEnum.accessDenied)
      expect(send.notCalled).to.be.true
      expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    })

    it(`checksums the address for ${method}`, async () => {
      const controller = sandbox.stub(SafeAdminController, method === 'post' ? 'add' : 'remove').resolves(true)

      const response = await supertest(createApp().callback())[method](`/safes/${NETWORK}/${SAFE.toLowerCase()}`)

      expect(response.status).to.equal(200)
      expect(response.body).to.be.true
      expect(controller.calledOnceWith({ network: NETWORK, address: SAFE })).to.be.true
    })

    for (const invalid of [
      { field: 'network', path: `/safes/unknown/${SAFE}` },
      { field: 'address', path: `/safes/${NETWORK}/0xnope` },
    ]) {
      it(`rejects an invalid ${invalid.field} for ${method}`, async () => {
        const controller = sandbox.stub(SafeAdminController, method === 'post' ? 'add' : 'remove').resolves(true)

        const response = await supertest(createApp().callback())[method](invalid.path)

        expect(response.status).to.equal(400)
        expect(controller.notCalled).to.be.true
      })
    }
  }

  for (const { code, status, key } of [
    { code: ISafeErrorCode.notFound, status: 404, key: ErrorKeyEnum.safeNotFound },
    { code: ISafeErrorCode.connectionError, status: 503, key: ErrorKeyEnum.safeConnectionError },
  ]) {
    it(`keeps the gateway ${status} response without storing or queueing a Safe`, async () => {
      const send = sandbox
        .stub(RabbitMQHelper, 'sendMessage')
        .resolves(new SafeReadError(code, 'Safe read failed', status).toQueueError())

      const response = await supertest(createApp().callback()).post(path)

      expect(response.status).to.equal(status)
      expect(response.body.code).to.equal(key)
      expect(send.calledOnce).to.be.true
      expect(send.firstCall.args[0]).to.equal(EnumQueueName.safeRead)
      expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    })
  }

  it('returns 501 for a chain without a Safe service before using the gateway', async () => {
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    const response = await supertest(createApp().callback()).post(`/safes/${NetworksEnum.citreaMainnet}/${SAFE}`)

    expect(response.status).to.equal(501)
    expect(response.body.code).to.equal(ErrorKeyEnum.safeUnsupportedChain)
    expect(send.notCalled).to.be.true
    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
  })

  it('adds and removes a Safe through the mounted admin routes', async () => {
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage')
    send.withArgs(EnumQueueName.safeRead).resolves({ owners: [SAFE], threshold: 1 })
    send.withArgs(EnumQueueName.safeTrack).resolves()
    const request = supertest(createApp().callback())

    const added = await request.post(path)
    expect(added.status).to.equal(200)
    expect(added.body).to.be.true
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).not.to.be.null
    const removed = await request.delete(path)

    expect(removed.status).to.equal(200)
    expect(removed.body).to.be.true
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
    expect(await Models.SafeAccount.countDocuments()).to.equal(1)
    expect(send.callCount).to.equal(2)
  })

  for (const kind of ['SPP body', 'Safe process'] as const) {
    it(`allows adding a ${kind} but rejects its removal with 400`, async () => {
      await Models.Dao.create({
        address: DAO,
        network: NETWORK,
        transactionHash: '0xdao',
        blockNumber: 1,
        creatorAddress: SAFE,
      })
      await Models.Plugin.create({
        address: kind === 'SPP body' ? SPP : SAFE,
        daoAddress: DAO,
        network: NETWORK,
        transactionHash: '0xplugin',
        blockNumber: 1,
        interfaceType: kind === 'SPP body' ? IPluginInterfaceType.spp : IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isSupported: true,
        isProcess: true,
        isBody: false,
      })
      if (kind === 'SPP body') {
        await Models.Setting.create({
          network: NETWORK,
          daoAddress: DAO,
          pluginAddress: SPP,
          transactionHash: '0xsetting',
          blockNumber: 1,
          status: ISettingStatus.active,
          stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }] }],
        })
      }
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage')
      send.withArgs(EnumQueueName.safeRead).resolves({ owners: [SAFE], threshold: 1 })
      send.withArgs(EnumQueueName.safeTrack).resolves()
      const request = supertest(createApp().callback())

      const added = await request.post(path)

      expect(added.status).to.equal(200)
      expect(added.body).to.be.true
      const before = await Models.SafeAccount.findTracked(NETWORK, SAFE)
      expect(before).not.to.be.null
      expect(send.callCount).to.equal(2)
      send.resetHistory()
      const untrack = sandbox.spy(Models.SafeAccount, 'untrack')

      const removed = await request.delete(`/safes/${NETWORK}/${SAFE.toLowerCase()}`)

      expect(removed.status).to.equal(400)
      expect(removed.body).to.include({ code: ErrorKeyEnum.badParams, description: REMOVE_MESSAGE, status: 400 })
      expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.deep.equal(before)
      expect(untrack.notCalled).to.be.true
      expect(send.notCalled).to.be.true
    })
  }
})
