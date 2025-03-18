import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ErrorMiddleware from '@services/aragon-api/middlewares/error'
import { ErrorKeyEnum } from '@types'

describe('middlewares: error', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('run', async () => {
    const next = sandbox.stub() as any
    const ctx = {} as any

    await ErrorMiddleware()(ctx, next)

    expect(next.calledWith()).to.be.true
  })

  it('catch', async () => {
    const next = sandbox.stub().rejects(new Error('coucou')) as any
    const ctx = { requestInfo: {} } as any

    await ErrorMiddleware()(ctx, next)

    expect(next.calledWith()).to.be.true
    expect(ctx.status).to.eq(500)
    expect(ctx.body).to.deep.eq({
      code: ErrorKeyEnum.unknownError,
      description: 'Internal server error',
      status: 500,
    })
  })

  it('catch with custom not found', async () => {
    const err = new Error(ErrorKeyEnum.badParams) as any
    err.exposeCustom_ = true
    err.status = 100
    err.description = 'desc'
    err.exposeMeta = 'meta'
    const next = sandbox.stub().rejects(err) as any
    const ctx = { requestInfo: {} } as any

    await ErrorMiddleware()(ctx, next)

    expect(next.calledWith()).to.be.true

    expect(ctx.status).to.eq(400)
    expect(ctx.body).to.deep.eq({
      code: ErrorKeyEnum.badParams,
      description: 'desc',
      meta: 'meta',
      status: 400,
    })
  })

  it('catch with custom not found', async () => {
    const err = new Error('coucou') as any
    err.exposeCustom_ = true
    err.status = 100
    err.description = 'desc'
    err.exposeMeta = 'meta'
    const next = sandbox.stub().rejects(err) as any
    const ctx = { requestInfo: {} } as any

    await ErrorMiddleware()(ctx, next)

    expect(next.calledWith()).to.be.true

    expect(ctx.status).to.eq(500)
    expect(ctx.body).to.deep.eq({
      code: ErrorKeyEnum.unknownError,
      description: 'desc',
      meta: 'meta',
      status: 500,
    })
  })
})
