import ContractController from '@api/controllers/contract'
import MainRouter from '@api/routers'
import ContractRouterV3 from '@api/routers/v3/contract'
import config from '@config'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import supertest from 'supertest'

const daoAddress = '0xf2d594f3c93c19d7b1a6f15b5489ffce4b01f7da'
const targetAddress = '0x5fbdb2315678afecb367f032d93f642f64180aa3'

const buildCtx = (query: Record<string, any> = {}, actions?: any[]) => ({
  params: { network: NetworksEnum.ethereumMainnet },
  query,
  request: {
    body: actions ?? [{ to: targetAddress, data: '0x12345678', value: '0' }],
  },
  body: null,
})

describe('RouterV3: Contract', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('decodeActionBatch', () => {
    it('Should decode the batch without a `from` and return the results', async () => {
      const mockResponse = [{ type: 'Unknown', from: '', to: targetAddress }] as any
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves(mockResponse)

      const ctx: any = buildCtx()

      await ContractRouterV3.decodeActionBatch(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      const params = stubCtrl.firstCall.args[0]
      expect(params.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(params.from).to.be.undefined
      expect(params.actions).to.deep.equal([{ to: getAddress(targetAddress), data: '0x12345678', value: '0' }])
      expect(ctx.body).to.deep.equal(mockResponse)
    })

    it('Should forward the optional `from` query param, checksummed', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx({ from: daoAddress })

      await ContractRouterV3.decodeActionBatch(ctx)

      expect(stubCtrl.firstCall.args[0].from).to.equal(getAddress(daoAddress))
    })

    it('Should accept a null action value', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx({}, [{ to: targetAddress, data: '0x', value: null }])

      await ContractRouterV3.decodeActionBatch(ctx)

      expect(stubCtrl.firstCall.args[0].actions[0].value).to.be.null
    })

    // `validateParams` runs Joi with `{ presence: 'required' }`, so every action key is mandatory
    // unless explicitly optional — matching V2, where the schema's `.default('0')` never fires.
    it('Should reject an action without a value', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx({}, [{ to: targetAddress, data: '0x' }])

      await expect(ContractRouterV3.decodeActionBatch(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })

    it('Should reject an invalid `from` query param', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx({ from: 'not-an-address' })

      await expect(ContractRouterV3.decodeActionBatch(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })

    it('Should reject an empty actions array', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx({}, [])

      await expect(ContractRouterV3.decodeActionBatch(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })

    it('Should reject a batch over the configured limit', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const actions = Array.from({ length: config.SERVICES.ARAGON_API.DECODE_ACTION_BATCH_LIMIT + 1 }, () => ({
        to: targetAddress,
        data: '0x12345678',
        value: '0',
      }))
      const ctx: any = buildCtx({}, actions)

      await expect(ContractRouterV3.decodeActionBatch(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })

    it('Should reject an unknown network', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const ctx: any = buildCtx()
      ctx.params.network = 'not-a-network'

      await expect(ContractRouterV3.decodeActionBatch(ctx)).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
      expect(stubCtrl.notCalled).to.be.true
    })
  })

  describe('router', () => {
    it('Should register the decode-batch route without an address segment', () => {
      const paths = ContractRouterV3.router().stack.map(layer => ({ path: layer.path, methods: layer.methods }))

      expect(paths).to.have.lengthOf(1)
      expect(paths[0].path).to.equal('/:network/decode-batch')
      expect(paths[0].methods).to.include('POST')
    })
  })

  describe('mounting', () => {
    const network = NetworksEnum.ethereumMainnet
    const actions = [{ to: targetAddress, data: '0x12345678', value: '0' }]

    const buildRequest = () => {
      const app = new Koa()
      // The real service wraps the router in `errorMiddleware`; here we only need the thrown
      // validation error to surface as a non-200, without Koa logging it.
      app.on('error', () => {})
      app.use(bodyParser())
      app.use(MainRouter.router().routes())
      return supertest(app.callback())
    }

    it('Should reach the V3 handler with no `from` on the versioned path', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest().post(`/v3/contract/${network}/decode-batch`).send(actions)

      expect(response.status).to.equal(200)
      expect(stubCtrl.firstCall.args[0].from).to.be.undefined
      expect(stubCtrl.firstCall.args[0].network).to.equal(network)
    })

    it('Should reach the V3 handler with `from` from the query string', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest()
        .post(`/v3/contract/${network}/decode-batch?from=${daoAddress}`)
        .send(actions)

      expect(response.status).to.equal(200)
      expect(stubCtrl.firstCall.args[0].from).to.equal(getAddress(daoAddress))
    })

    it('Should resolve the unversioned path to V3', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest().post(`/contract/${network}/decode-batch`).send(actions)

      expect(response.status).to.equal(200)
      expect(stubCtrl.firstCall.args[0].from).to.be.undefined
    })

    it('Should leave the V2 path with an address segment untouched', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest().post(`/v2/contract/${network}/${daoAddress}/decode-batch`).send(actions)

      expect(response.status).to.equal(200)
      expect(stubCtrl.firstCall.args[0].from).to.equal(getAddress(daoAddress))
    })

    it('Should still fall back to V2 for the unversioned path with an address segment', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest().post(`/contract/${network}/${daoAddress}/decode-batch`).send(actions)

      expect(response.status).to.equal(200)
      expect(stubCtrl.firstCall.args[0].from).to.equal(getAddress(daoAddress))
    })

    it('Should reject an unknown query param on the V3 route', async () => {
      const stubCtrl = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves([] as any)

      const response = await buildRequest()
        .post(`/v3/contract/${network}/decode-batch?daoAddress=${daoAddress}`)
        .send(actions)

      expect(response.status).to.not.equal(200)
      expect(stubCtrl.notCalled).to.be.true
    })
  })
})
