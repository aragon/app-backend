import IpfsController from '@api/controllers/ipfs'
import IpfsSchema from '@api/routers/schema/ipfs'
import IpfsRouter from '@api/routers/v2/ipfs'
import { CACHE_CONTROL_HEADERS } from '@config'
import ValidationSchema from '@helpers/validationSchema'
import Router from '@koa/router'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Ipfs', () => {
  let sandbox: SinonSandbox

  const cid = 'QmTzQ1JRkWErjk39mryYw2WVaphAZNAREyMchXzYQ7c15S'

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDelegateStatement', () => {
    it('Should resolve the delegate statement and set the cache header', async () => {
      const mockResult = {
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: 'I believe in long-term protocol health.',
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves({ params: { cid } } as any)
      const controllerStub = sandbox.stub(IpfsController, 'getDelegateStatement').resolves(mockResult as any)

      const setSpy = sandbox.spy()
      const ctx: any = {
        params: { cid },
        set: setSpy,
      }

      await IpfsRouter.getDelegateStatement(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnceWith(cid)).to.be.true
      expect(setSpy.calledOnceWith('Cache-Control', CACHE_CONTROL_HEADERS)).to.be.true
    })

    it('Should pass the schema and cid to validateRoute', async () => {
      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves({ params: { cid } } as any)
      sandbox.stub(IpfsController, 'getDelegateStatement').resolves({} as any)

      const ctx: any = {
        params: { cid },
        set: sandbox.spy(),
      }

      await IpfsRouter.getDelegateStatement(ctx)

      const validationArgs = validationStub.args[0]
      expect(validationArgs[0]).to.eq(ctx)
      expect(validationArgs[1].params!.cid).to.eq(cid)
      expect(validationArgs[1].schemas.params).to.eq(IpfsSchema.getDelegateStatement)
    })

    it('Should propagate validation errors', async () => {
      const validationError = new Error('Invalid cid')
      sandbox.stub(ValidationSchema, 'validateRoute').rejects(validationError)

      const ctx: any = {
        params: { cid: 'not-a-cid' },
        set: sandbox.spy(),
      }

      await expect(IpfsRouter.getDelegateStatement(ctx)).to.be.rejectedWith('Invalid cid')
    })

    it('Should propagate controller errors', async () => {
      sandbox.stub(ValidationSchema, 'validateRoute').resolves({ params: { cid } } as any)
      sandbox.stub(IpfsController, 'getDelegateStatement').rejects(new Error('IPFS unreachable'))

      const ctx: any = {
        params: { cid },
        set: sandbox.spy(),
      }

      await expect(IpfsRouter.getDelegateStatement(ctx)).to.be.rejectedWith('IPFS unreachable')
    })
  })

  describe('router', () => {
    it('Should return a router with the delegate-statement route', () => {
      const router = IpfsRouter.router()

      expect(router).to.be.instanceOf(Router)
      expect(router.stack).to.have.lengthOf(1)
      expect(router.stack[0].path).to.eq('/delegate-statement/:cid')
      expect(router.stack[0].methods).to.include('GET')
    })
  })

  describe('getDelegateStatement schema validation', () => {
    it('Should accept a valid CIDv0', () => {
      const { error } = IpfsSchema.getDelegateStatement.validate({ cid })
      expect(error).to.be.undefined
    })

    it('Should accept a valid CIDv1', () => {
      const cidV1 = 'bafybeibwzifw52ttrkqlikfzextbm45w2g4n4xhwzbpzylprtvolt7xfla'
      const { error } = IpfsSchema.getDelegateStatement.validate({ cid: cidV1 })
      expect(error).to.be.undefined
    })

    it('Should reject a malformed CID', () => {
      const { error } = IpfsSchema.getDelegateStatement.validate({ cid: 'not-a-real-cid' })
      expect(error).to.exist
    })

    it('Should reject a missing CID', () => {
      const { error } = IpfsSchema.getDelegateStatement.validate({})
      expect(error).to.exist
    })
  })
})
