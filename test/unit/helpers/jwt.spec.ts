import config from '@config'
import JwtHelper from '@helpers/jwt'
import { expect } from 'chai'
import jwt, { JwtPayload } from 'jsonwebtoken'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: JwtHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get JWT_KEY', () => {
    expect(JwtHelper.JWT_KEY).to.equal(config.SERVICES.ARAGON_ADMIN_API.JWT_KEY)
  })

  it('should generateJWT', () => {
    const jwtData = { userId: 1 }
    const token = JwtHelper.generateJWT(jwtData)
    expect(token).to.be.a('string')
  })

  it('should decodeJWT', () => {
    const jwtData = { userId: 1 }
    const token = jwt.sign(jwtData, config.SERVICES.ARAGON_ADMIN_API.JWT_SECRET)
    const decoded = JwtHelper.decodeJWT(token) as JwtPayload
    expect(decoded).to.include(jwtData)
  })

  it('should readJWT', () => {
    const middleware = JwtHelper.readJWT()
    expect(middleware).to.be.a('function')
  })
})
