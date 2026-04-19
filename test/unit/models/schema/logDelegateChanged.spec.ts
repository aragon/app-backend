import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const TOKEN_ADDRESS = '0x4444444444444444444444444444444444444444'
const ALICE = '0x000000000000000000000000000000000000aaaa'
const BOB = '0x000000000000000000000000000000000000BbBB'
const JORDAN = '0x000000000000000000000000000000000000CcCc'
const NETWORK = NetworksEnum.ethereumMainnet

describe('Model: LogDelegateChanged', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getEntityId', () => {
    it('should generate correct entity id', () => {
      const id = Models.LogDelegateChanged.getEntityId({
        network: NETWORK,
        transactionHash: '0xabc',
        transactionIndex: 1,
        logIndex: 2,
      })
      expect(id).to.equal(`${NETWORK}-0xabc-1-2`)
    })
  })

  describe('create', () => {
    it('should create a log with auto-generated id', async () => {
      const doc = await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xldc1',
        transactionIndex: 0,
        logIndex: 0,
      })

      expect(doc).to.exist
      expect(doc.id).to.equal(`${NETWORK}-0xldc1-0-0`)
      expect(doc.delegator).to.equal(ALICE)
      expect(doc.fromDelegate).to.equal(ALICE)
      expect(doc.toDelegate).to.equal(BOB)
    })

    it('should use provided id if set', async () => {
      const doc = await Models.LogDelegateChanged.create({
        id: 'custom-id',
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xldc2',
        transactionIndex: 0,
        logIndex: 0,
      })

      expect(doc.id).to.equal('custom-id')
    })
  })

  describe('findExistingLog', () => {
    it('should find an existing log by params', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xfind1',
        transactionIndex: 0,
        logIndex: 3,
      })

      const found = await Models.LogDelegateChanged.findExistingLog({
        network: NETWORK,
        transactionHash: '0xfind1',
        transactionIndex: 0,
        logIndex: 3,
      })

      expect(found).to.exist
      expect(found!.delegator).to.equal(ALICE)
    })

    it('should return null if not found', async () => {
      const found = await Models.LogDelegateChanged.findExistingLog({
        network: NETWORK,
        transactionHash: '0xmissing',
        transactionIndex: 0,
        logIndex: 0,
      })
      expect(found).to.be.null
    })
  })

  describe('findByEntityId', () => {
    it('should find a log by entity id', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: BOB,
        fromDelegate: BOB,
        toDelegate: JORDAN,
        blockNumber: 200,
        blockTimestamp: 2000,
        transactionHash: '0xeid1',
        transactionIndex: 1,
        logIndex: 0,
      })

      const entityId = `${NETWORK}-0xeid1-1-0`
      const found = await Models.LogDelegateChanged.findByEntityId(entityId)

      expect(found).to.exist
      expect(found!.delegator).to.equal(BOB)
      expect(found!.toDelegate).to.equal(JORDAN)
    })
  })

  describe('countActiveDelegationsForMembers', () => {
    it('should count active delegations for a member', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xcad1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: JORDAN,
        fromDelegate: JORDAN,
        toDelegate: BOB,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xcad2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.countActiveDelegationsForMembers(TOKEN_ADDRESS, NETWORK, [BOB])

      expect(result[BOB]).to.equal(2)
    })

    it('should not count delegators who later changed their delegate', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xcad3',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: BOB,
        toDelegate: JORDAN,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xcad4',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.countActiveDelegationsForMembers(TOKEN_ADDRESS, NETWORK, [BOB])

      expect(result[BOB]).to.be.undefined
    })

    it('should return counts for multiple members at once', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xcad5',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: JORDAN,
        fromDelegate: JORDAN,
        toDelegate: ALICE,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xcad6',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.countActiveDelegationsForMembers(TOKEN_ADDRESS, NETWORK, [
        BOB,
        ALICE,
      ])

      expect(result[BOB]).to.equal(1)
      expect(result[ALICE]).to.equal(1)
    })

    it('should return empty object for empty address list', async () => {
      const result = await Models.LogDelegateChanged.countActiveDelegationsForMembers(TOKEN_ADDRESS, NETWORK, [])
      expect(result).to.deep.equal({})
    })
  })

  describe('findLatestByDelegates', () => {
    it('should return latest delegation per delegator for given delegates', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xfl1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: BOB,
        toDelegate: JORDAN,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xfl2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.findLatestByDelegates(TOKEN_ADDRESS, NETWORK, [JORDAN], 1000)

      expect(result).to.have.lengthOf(1)
      expect(result[0]._id).to.equal(ALICE)
      expect(result[0].toDelegate).to.equal(JORDAN)
    })

    it('should not return delegators whose latest delegation is to a different address', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xfl3',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: BOB,
        toDelegate: JORDAN,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xfl4',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.findLatestByDelegates(TOKEN_ADDRESS, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(0)
    })

    it('should respect maxBlockTimestamp', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 200,
        blockTimestamp: 2000,
        transactionHash: '0xfl5',
        transactionIndex: 0,
        logIndex: 0,
      })

      const before = await Models.LogDelegateChanged.findLatestByDelegates(TOKEN_ADDRESS, NETWORK, [BOB], 1000)
      expect(before).to.have.lengthOf(0)

      const after = await Models.LogDelegateChanged.findLatestByDelegates(TOKEN_ADDRESS, NETWORK, [BOB], 3000)
      expect(after).to.have.lengthOf(1)
    })

    it('should handle multiple delegators to the same delegate', async () => {
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xfl6',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: JORDAN,
        fromDelegate: JORDAN,
        toDelegate: BOB,
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xfl7',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.findLatestByDelegates(TOKEN_ADDRESS, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(2)
      const delegators = result.map((r: any) => r._id).sort()
      expect(delegators).to.deep.equal([ALICE, JORDAN].sort())
    })
  })

  describe('findDelegatorsForMember', () => {
    beforeEach(async () => {
      // ALICE and JORDAN delegate to BOB
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: ALICE,
        toDelegate: BOB,
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xfd1',
        transactionIndex: 0,
        logIndex: 0,
      })
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: JORDAN,
        fromDelegate: JORDAN,
        toDelegate: BOB,
        blockNumber: 110,
        blockTimestamp: 1100,
        transactionHash: '0xfd2',
        transactionIndex: 0,
        logIndex: 0,
      })

      // Seed TokenMember records for VP
      await Models.TokenMember.create({
        memberAddress: ALICE,
        tokenAddress: TOKEN_ADDRESS,
        network: NETWORK,
        votingPower: '5000',
      })
      await Models.TokenMember.create({
        memberAddress: JORDAN,
        tokenAddress: TOKEN_ADDRESS,
        network: NETWORK,
        votingPower: '3000',
      })

      // Seed Member records for ENS lookup
      await Models.Member.create({ address: ALICE, ens: 'alice.eth' })
      await Models.Member.create({ address: JORDAN, ens: null })
    })

    it('should return delegators with voting power sorted desc', async () => {
      const result = await Models.LogDelegateChanged.findDelegatorsForMember(TOKEN_ADDRESS, NETWORK, BOB, {
        sort: 'votingPower',
        order: 'desc',
      })

      expect(result.data).to.have.lengthOf(2)
      expect(result.data[0].address).to.equal(ALICE)
      expect(result.data[0].votingPower).to.equal('5000')
      expect(result.data[0].ens).to.equal('alice.eth')
      expect(result.data[1].address).to.equal(JORDAN)
      expect(result.data[1].votingPower).to.equal('3000')
      expect(result.metadata.totalRecords).to.equal(2)
    })

    it('should return empty when no delegators', async () => {
      const result = await Models.LogDelegateChanged.findDelegatorsForMember(TOKEN_ADDRESS, NETWORK, ALICE)

      expect(result.data).to.have.lengthOf(0)
      expect(result.metadata.totalRecords).to.equal(0)
    })

    it('should respect re-delegation (latest record wins)', async () => {
      // ALICE re-delegates away from BOB to JORDAN
      await Models.LogDelegateChanged.create({
        network: NETWORK,
        tokenAddress: TOKEN_ADDRESS,
        delegator: ALICE,
        fromDelegate: BOB,
        toDelegate: JORDAN,
        blockNumber: 200,
        blockTimestamp: 2000,
        transactionHash: '0xfd3',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.LogDelegateChanged.findDelegatorsForMember(TOKEN_ADDRESS, NETWORK, BOB)

      // Only JORDAN still delegates to BOB
      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].address).to.equal(JORDAN)
    })

    it('should paginate results', async () => {
      const result = await Models.LogDelegateChanged.findDelegatorsForMember(TOKEN_ADDRESS, NETWORK, BOB, {
        pageSize: 1,
        page: 1,
        sort: 'votingPower',
        order: 'desc',
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.metadata.totalRecords).to.equal(2)
      expect(result.metadata.totalPages).to.equal(2)
    })

    it('should return empty paginated response when page exceeds total pages', async () => {
      const result = await Models.LogDelegateChanged.findDelegatorsForMember(TOKEN_ADDRESS, NETWORK, BOB, {
        page: 99,
        pageSize: 10,
      })

      expect(result.data).to.have.lengthOf(0)
      expect(result.metadata.totalRecords).to.equal(0)
    })
  })
})
