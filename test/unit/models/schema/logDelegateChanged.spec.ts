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
})
