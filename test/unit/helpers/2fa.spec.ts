import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import speakeasy from 'speakeasy'
import TwoFaHelper from '@helpers/2fa'

describe('Helpers: 2FA', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('generateSecret', () => {
    it('should generate a secret with default length', () => {
      const secret = TwoFaHelper.generateSecret()
      expect(secret).to.have.property('base32').that.is.a('string')
      expect(secret).to.have.property('ascii').that.is.a('string')
      expect(secret).to.have.property('hex').that.is.a('string')
    })

    it('should generate a secret with a custom length', () => {
      const secret = TwoFaHelper.generateSecret(32)
      expect(secret.base32.length).to.be.greaterThan(20) // Ensures length variation
    })
  })

  describe('verifyTOTP', () => {
    it('should return true for a valid TOTP token', () => {
      const secret = speakeasy.generateSecret().base32
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const isValid = TwoFaHelper.verifyTOTP({ secret, token })
      expect(isValid).to.be.true
    })

    it('should return false for an invalid TOTP token', () => {
      const secret = speakeasy.generateSecret().base32
      const isValid = TwoFaHelper.verifyTOTP({ secret, token: '000000' })
      expect(isValid).to.be.false
    })

    it('should use the default encoding (base32) when not provided', () => {
      const secret = speakeasy.generateSecret().base32
      const token = speakeasy.totp({ secret, encoding: 'base32' })

      const isValid = TwoFaHelper.verifyTOTP({ secret, token })
      expect(isValid).to.be.true
    })
  })
})
