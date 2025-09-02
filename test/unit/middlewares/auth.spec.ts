import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
const { expect } = chai
import { ErrorKeyEnum, IJwtTokenType } from '@types'
import JwtHelper from '@helpers/jwt'
import AuthMiddleware from '@middlewares/auth'
import TwoFaHelper from '@helpers/2fa'
import { Models } from '@dbModels'

describe('middlewares: auth', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('_generateJWTLogin', () => {
    it('should generate a JWT login token', () => {
      const jwtStub = sandbox.stub(JwtHelper, 'generateJWT').returns('mocked_jwt')
      const token = AuthMiddleware._generateJWTLogin('tokenValue', 'userAgent', IJwtTokenType.admin)

      expect(jwtStub.calledOnce).to.be.true
      const jwtCallArgs = jwtStub.firstCall.args[0]
      expect(jwtCallArgs).to.have.property('auth', 'aragon-admin')
      expect(jwtCallArgs).to.have.property('token', 'tokenValue')
      expect(token).to.equal('mocked_jwt')
    })
  })

  describe('generateJwtAuth', () => {
    it('should generate a JWT authentication token', async () => {
      const secretStub = sandbox.stub(TwoFaHelper, 'generateSecret').returns({ base32: 'mocked_secret' } as any)
      const createStub = sandbox.stub(Models.Jwt, 'create').resolves({ value: 'mocked_secret' })

      const token = await AuthMiddleware.generateJwtAuth(IJwtTokenType.admin)

      expect(secretStub.calledOnce).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(token).to.be.a('string')
    })
  })

  describe('authAssertAdmin', () => {
    let ctx: any, next: sinon.SinonSpy, findByValueStub: sinon.SinonStub

    beforeEach(() => {
      ctx = {
        state: {
          [JwtHelper.JWT_KEY]: { token: 'valid_token' },
        },
      }
      next = sandbox.spy()
      findByValueStub = sandbox
        .stub(Models.Jwt, 'findByValue')
        .resolves({ type: IJwtTokenType.admin, updateOnly: sinon.stub().resolves() })
    })

    it('should allow access for a valid admin token', async () => {
      await AuthMiddleware.authAssertAdmin()(ctx, next)

      expect(findByValueStub.calledOnce).to.be.true
      expect(ctx.state.token).to.be.an('object')
      expect(next.calledOnce).to.be.true
    })

    it('should deny access for missing token', async () => {
      ctx.state[JwtHelper.JWT_KEY] = null
      await expect(AuthMiddleware.authAssertAdmin()(ctx, next)).to.be.rejectedWith(Error, ErrorKeyEnum.accessDenied)
    })
  })
})
