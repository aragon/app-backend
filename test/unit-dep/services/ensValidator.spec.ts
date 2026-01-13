import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import { EnsValidator } from '@services/aragon-rates/handlers/ensValidator'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('Integ: EnsValidator', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    await Models.Member.deleteMany({})
  })

  afterEach(async () => {
    sandbox.restore()
    await Models.Member.deleteMany({})
  })

  describe('Test 1: Valid ENS - should NOT change', () => {
    it('should keep ENS when still resolves to same address', async () => {
      // Pre-populate: member with valid ENS
      const validAddress = '0xD70aa9d7280E6FEe89B86f53c0B2A363478D5e94'
      const validEns = 'amiru.eth'

      // Stub to return the same ENS (simulating no change)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(validEns as any)

      await Models.Member.create({
        address: validAddress,
        ens: validEns,
      })

      // Run validator
      await EnsValidator.start()

      // Verify: ENS unchanged
      const member = await Models.Member.findOne({ address: validAddress })
      expect(member?.ens).to.eq(validEns)
    })
  })

  describe('Test 2: ENS changed - should UPDATE to new ENS', () => {
    it('should update ENS when user changed their ENS name', async () => {
      const memberAddress = '0xD70aa9d7280E6FEe89B86f53c0B2A363478D5e94'
      const oldEns = 'oldname.eth'
      const newEns = 'newname.eth'

      // Stub: simulate ENS changed from old to new
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(newEns as any)

      await Models.Member.create({
        address: memberAddress,
        ens: oldEns,
      })

      await EnsValidator.start()

      // Verify: ENS updated to new value
      const member = await Models.Member.findOne({ address: memberAddress })
      expect(member?.ens).to.eq(newEns)
    })
  })

  describe('Test 3: ENS expired - should SET NULL', () => {
    it('should clear ENS when no longer resolves', async () => {
      const memberAddress = '0x1234567890123456789012345678901234567890'

      // Stub: simulate ENS expired (returns null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(null)

      await Models.Member.create({
        address: memberAddress,
        ens: 'expired.eth',
      })

      await EnsValidator.start()

      // Verify: ENS set to null
      const member = await Models.Member.findOne({ address: memberAddress })
      expect(member?.ens).to.be.null
    })
  })

  describe('Test 4: Mixed states - batch processing', () => {
    it('should handle multiple members correctly', async () => {
      // Stub different responses per address
      const stub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver')
      stub.withArgs('0xAAA0000000000000000000000000000000000000').resolves('same.eth' as any)
      stub.withArgs('0xBBB0000000000000000000000000000000000000').resolves('updated.eth' as any)
      stub.withArgs('0xCCC0000000000000000000000000000000000000').resolves(null)

      // Create members with different ENS states
      await Models.Member.create({
        address: '0xAAA0000000000000000000000000000000000000',
        ens: 'same.eth',
      })
      await Models.Member.create({
        address: '0xBBB0000000000000000000000000000000000000',
        ens: 'old.eth',
      })
      await Models.Member.create({
        address: '0xCCC0000000000000000000000000000000000000',
        ens: 'expired.eth',
      })

      await EnsValidator.start()

      const m1 = await Models.Member.findOne({ address: '0xAAA0000000000000000000000000000000000000' })
      const m2 = await Models.Member.findOne({ address: '0xBBB0000000000000000000000000000000000000' })
      const m3 = await Models.Member.findOne({ address: '0xCCC0000000000000000000000000000000000000' })

      expect(m1?.ens).to.eq('same.eth') // Unchanged
      expect(m2?.ens).to.eq('updated.eth') // Updated
      expect(m3?.ens).to.be.null // Cleared
    })
  })

  describe('Test 5: Members without ENS should be skipped', () => {
    it('should not process members that have no ENS', async () => {
      const stub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver')

      // Create member without ENS
      await Models.Member.create({
        address: '0xDDD0000000000000000000000000000000000000',
        ens: null,
      })

      await EnsValidator.start()

      // Verify: getEnsWithUniversalResolver was NOT called for this member
      expect(stub.called).to.be.false

      // Member should still have null ENS
      const member = await Models.Member.findOne({ address: '0xDDD0000000000000000000000000000000000000' })
      expect(member?.ens).to.be.null
    })
  })
})
