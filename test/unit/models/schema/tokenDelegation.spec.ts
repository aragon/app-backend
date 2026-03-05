import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const CONTRACT = '0x3333333333333333333333333333333333333333'
const ALICE = '0x000000000000000000000000000000000000aaaa'
const BOB = '0x000000000000000000000000000000000000BbBB'
const JORDAN = '0x000000000000000000000000000000000000CcCc'
const NETWORK = NetworksEnum.ethereumMainnet

describe('Model: TokenDelegation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getEntityId', () => {
    it('should generate correct entity id', () => {
      const id = Models.TokenDelegation.getEntityId({
        network: NETWORK,
        transactionHash: '0xabc',
        transactionIndex: 0,
        logIndex: 3,
      })
      expect(id).to.equal(`${NETWORK}-0xabc-0-3`)
    })
  })

  describe('createLog', () => {
    it('should create a delegation log with auto-generated id', async () => {
      const doc = await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['1', '2'],
        action: 'delegate',
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xabc',
        transactionIndex: 0,
        logIndex: 0,
      })

      expect(doc).to.exist
      expect(doc.id).to.equal(`${NETWORK}-0xabc-0-0`)
      expect(doc.delegator).to.equal(ALICE)
      expect(doc.delegate).to.equal(BOB)
      expect(doc.tokenIds).to.deep.equal(['1', '2'])
      expect(doc.action).to.equal('delegate')
    })

    it('should not create duplicate on same entity id', async () => {
      const data = {
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['1'],
        action: 'delegate' as const,
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xdup',
        transactionIndex: 0,
        logIndex: 0,
      }

      await Models.TokenDelegation.createLog(data)
      await Models.TokenDelegation.createLog(data)

      const count = await Models.TokenDelegation.countDocuments({ id: `${NETWORK}-0xdup-0-0` })
      expect(count).to.equal(1)
    })
  })

  describe('findExistingLog', () => {
    it('should find an existing log by params', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['1'],
        action: 'delegate',
        blockNumber: 100,
        blockTimestamp: 1000,
        transactionHash: '0xfind',
        transactionIndex: 0,
        logIndex: 5,
      })

      const found = await Models.TokenDelegation.findExistingLog({
        network: NETWORK,
        transactionHash: '0xfind',
        transactionIndex: 0,
        logIndex: 5,
      })

      expect(found).to.exist
      expect(found!.delegator).to.equal(ALICE)
    })

    it('should return null if not found', async () => {
      const found = await Models.TokenDelegation.findExistingLog({
        network: NETWORK,
        transactionHash: '0xmissing',
        transactionIndex: 0,
        logIndex: 0,
      })
      expect(found).to.be.null
    })
  })

  describe('getActiveDelegations', () => {
    it('should return active delegations for given delegates up to timestamp', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['1'],
        action: 'delegate',
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xd1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: JORDAN,
        delegate: BOB,
        tokenIds: ['2'],
        action: 'delegate',
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xd2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.TokenDelegation.getActiveDelegations(CONTRACT, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(2)
      const delegators = result.map((r: any) => r.delegator).sort()
      expect(delegators).to.deep.equal([ALICE, JORDAN].sort())
      expect(result.every((r: any) => r.delegate === BOB)).to.be.true
    })

    it('should exclude undelegated tokens', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['10'],
        action: 'delegate',
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xu1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['10'],
        action: 'undelegate',
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xu2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.TokenDelegation.getActiveDelegations(CONTRACT, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(0)
    })

    it('should respect maxTimestamp filter', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['20'],
        action: 'delegate',
        blockNumber: 200,
        blockTimestamp: 2000,
        transactionHash: '0xt1',
        transactionIndex: 0,
        logIndex: 0,
      })

      const before = await Models.TokenDelegation.getActiveDelegations(CONTRACT, NETWORK, [BOB], 1000)
      expect(before).to.have.lengthOf(0)

      const after = await Models.TokenDelegation.getActiveDelegations(CONTRACT, NETWORK, [BOB], 3000)
      expect(after).to.have.lengthOf(1)
    })

    it('should only return delegations for requested delegate addresses', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['30'],
        action: 'delegate',
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xf1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: JORDAN,
        delegate: ALICE,
        tokenIds: ['31'],
        action: 'delegate',
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xf2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.TokenDelegation.getActiveDelegations(CONTRACT, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].delegate).to.equal(BOB)
    })
  })

  describe('getDelegationSnapshots', () => {
    it('should return snapshots grouped by delegator and tokenId', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['40'],
        action: 'delegate',
        blockNumber: 50,
        blockTimestamp: 500,
        transactionHash: '0xs1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: JORDAN,
        tokenIds: ['40'],
        action: 'delegate',
        blockNumber: 60,
        blockTimestamp: 600,
        transactionHash: '0xs2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.TokenDelegation.getDelegationSnapshots(CONTRACT, NETWORK, [BOB, JORDAN], 1000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].tokenId).to.equal('40')
      expect(result[0].delegator).to.equal(ALICE)
      expect(result[0].snapshots).to.have.lengthOf(2)
      expect(result[0].delegates).to.include(BOB)
      expect(result[0].delegates).to.include(JORDAN)
    })

    it('should return empty array when no relevant delegators exist', async () => {
      const result = await Models.TokenDelegation.getDelegationSnapshots(CONTRACT, NETWORK, [BOB], 1000)
      expect(result).to.have.lengthOf(0)
    })

    it('should order snapshots by blockNumber descending', async () => {
      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['50'],
        action: 'delegate',
        blockNumber: 10,
        blockTimestamp: 100,
        transactionHash: '0xo1',
        transactionIndex: 0,
        logIndex: 0,
      })

      await Models.TokenDelegation.createLog({
        network: NETWORK,
        contractAddress: CONTRACT,
        delegator: ALICE,
        delegate: BOB,
        tokenIds: ['50'],
        action: 'undelegate',
        blockNumber: 20,
        blockTimestamp: 200,
        transactionHash: '0xo2',
        transactionIndex: 0,
        logIndex: 0,
      })

      const result = await Models.TokenDelegation.getDelegationSnapshots(CONTRACT, NETWORK, [BOB], 1000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].snapshots[0].blockNumber).to.equal(20)
      expect(result[0].snapshots[1].blockNumber).to.equal(10)
    })
  })
})
