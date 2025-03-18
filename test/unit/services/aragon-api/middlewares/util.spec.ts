import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import UtilMiddleware from '@services/aragon-api/middlewares/util'
import { ErrorKeyEnum } from '@types'

describe('middlewares: util', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('noop', async () => {
    const next = sandbox.stub().resolves('next1')
    const ctx = {} as any

    const res = await UtilMiddleware.noop(ctx, next)

    expect(res).to.eq('next1')
    expect(next.calledOnce).to.be.true
  })

  describe('onBodyParserError', () => {
    it('should throw entityTooLarge error when error type is entity.too.large', () => {
      const error = { type: 'entity.too.large' }

      expect(() => UtilMiddleware.onBodyParserError(error)).to.throw(ErrorKeyEnum.entityTooLarge)
    })

    it('should throw badParams error for other error types', () => {
      const error = { type: 'otherError', message: 'Some bad input' }

      expect(() => UtilMiddleware.onBodyParserError(error)).to.throw(ErrorKeyEnum.badParams)
    })
  })
})
