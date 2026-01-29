import { Models } from '@dbModels'
import { HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: SignatureNonce', () => {
  let sandbox: SinonSandbox

  const testDaoAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const testAction = 'PREPARE_CAMPAIGN'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('generate', () => {
    it('should generate a new nonce with correct fields', async () => {
      const result = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      expect(result.nonce).to.be.a('string')
      expect(result.nonce).to.have.length.greaterThan(0)
      expect(result.daoAddress).to.equal(testDaoAddress)
      expect(result.network).to.equal(testNetwork)
      expect(result.action).to.equal(testAction)
      expect(result.expiresAt).to.be.a('number')
      expect(result.expiresAt).to.be.greaterThan(Date.now())
      expect(result.usedAt).to.be.null
    })

    it('should set expiresAt to 5 minutes from now', async () => {
      const beforeGenerate = Date.now()
      const result = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })
      const afterGenerate = Date.now()

      const fiveMinutesMs = 5 * 60 * 1000
      expect(result.expiresAt).to.be.greaterThanOrEqual(beforeGenerate + fiveMinutesMs)
      expect(result.expiresAt).to.be.lessThanOrEqual(afterGenerate + fiveMinutesMs)
    })

    it('should generate unique nonces', async () => {
      const result1 = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      const result2 = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      expect(result1.nonce).to.not.equal(result2.nonce)
    })
  })

  describe('findByNonce', () => {
    it('should find existing nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      const found = await Models.SignatureNonce.findByNonce(generated.nonce)

      expect(found).to.exist
      expect(found!.nonce).to.equal(generated.nonce)
      expect(found!.daoAddress).to.equal(testDaoAddress)
    })

    it('should return null for non-existent nonce', async () => {
      const found = await Models.SignatureNonce.findByNonce('non-existent-nonce')

      expect(found).to.be.null
    })
  })

  describe('consumeNonce', () => {
    it('should consume valid unused nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      const consumed = await Models.SignatureNonce.consumeNonce(generated.nonce)

      expect(consumed).to.exist
      expect(consumed!.nonce).to.equal(generated.nonce)
      expect(consumed!.usedAt).to.be.a('number')
      expect(consumed!.usedAt).to.be.greaterThan(0)
    })

    it('should return null for already used nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      // First consume
      await Models.SignatureNonce.consumeNonce(generated.nonce)

      // Second consume should fail
      const secondConsume = await Models.SignatureNonce.consumeNonce(generated.nonce)

      expect(secondConsume).to.be.null
    })

    it('should return null for non-existent nonce', async () => {
      const consumed = await Models.SignatureNonce.consumeNonce('non-existent-nonce')

      expect(consumed).to.be.null
    })

    it('should return null for expired nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      // Manually set expiresAt to past
      generated.expiresAt = Date.now() - 1000
      await generated.save()

      const consumed = await Models.SignatureNonce.consumeNonce(generated.nonce)

      expect(consumed).to.be.null
    })
  })

  describe('isExpired getter', () => {
    it('should return false for non-expired nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      expect(generated.isExpired).to.be.false
    })

    it('should return true for expired nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      generated.expiresAt = Date.now() - 1000

      expect(generated.isExpired).to.be.true
    })
  })

  describe('isUsed getter', () => {
    it('should return false for unused nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      expect(generated.isUsed).to.be.false
    })

    it('should return true for used nonce', async () => {
      const generated = await Models.SignatureNonce.generate({
        daoAddress: testDaoAddress,
        network: testNetwork,
        action: testAction,
      })

      const consumed = await Models.SignatureNonce.consumeNonce(generated.nonce)

      expect(consumed!.isUsed).to.be.true
    })
  })
})
