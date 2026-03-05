import { Models } from '@dbModels'
import VoteGauge from '@models/schema/voteGauge'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x1111111111111111111111111111111111111111'
const GAUGE_A = '0x2222222222222222222222222222222222222222'
const GAUGE_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const ALICE = '0x3333333333333333333333333333333333333333'
const BOB = '0x4444444444444444444444444444444444444444'
const NETWORK = NetworksEnum.ethereumMainnet

async function seedVote(overrides: Record<string, any> = {}) {
  const base = {
    network: NETWORK,
    pluginAddress: PLUGIN,
    gaugeAddress: GAUGE_A,
    memberAddress: ALICE,
    epochId: '5',
    votingPower: '100',
    type: 'vote',
    blockNumber: 100,
    blockTimestamp: 1000,
    transactionHash: '0xdefault',
    transactionIndex: 0,
    logIndex: 0,
    ...overrides,
  }
  return Models.VoteGauge.create(base)
}

describe('Model: VoteGauge', () => {
  let sandbox: SinonSandbox
  let rawVoteEpoch: Partial<VoteGauge>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawVoteEpoch = {
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      transactionIndex: 0,
      logIndex: 5,
      blockNumber: 12345678,
      blockTimestamp: 1234567890,
      network: NETWORK,
      pluginAddress: PLUGIN,
      gaugeAddress: GAUGE_A,
      memberAddress: ALICE,
      epochId: '1',
      votingPower: '1000000000000000000',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create VoteGauge', () => {
    it('Should create VoteGauge', async () => {
      const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)

      expect(createdVoteEpoch.id).to.exist
      expect(createdVoteEpoch.transactionHash).to.eq(rawVoteEpoch.transactionHash)
      expect(createdVoteEpoch.transactionIndex).to.eq(rawVoteEpoch.transactionIndex)
      expect(createdVoteEpoch.logIndex).to.eq(rawVoteEpoch.logIndex)
      expect(createdVoteEpoch.blockNumber).to.eq(rawVoteEpoch.blockNumber)
      expect(createdVoteEpoch.blockTimestamp).to.eq(rawVoteEpoch.blockTimestamp)
      expect(createdVoteEpoch.network).to.eq(rawVoteEpoch.network)
      expect(createdVoteEpoch.gaugeAddress).to.eq(rawVoteEpoch.gaugeAddress)
      expect(createdVoteEpoch.memberAddress).to.eq(rawVoteEpoch.memberAddress)
      expect(createdVoteEpoch.epochId).to.eq(rawVoteEpoch.epochId)
      expect(createdVoteEpoch.votingPower).to.eq(rawVoteEpoch.votingPower)
      expect(createdVoteEpoch.pluginAddress).to.eq(rawVoteEpoch.pluginAddress)
      expect(createdVoteEpoch.type).to.eq('vote')
    })

    it('Should create VoteGauge with id already present', async () => {
      const entityId = Models.VoteGauge.getEntityId({
        network: rawVoteEpoch.network!,
        transactionHash: rawVoteEpoch.transactionHash!,
        transactionIndex: rawVoteEpoch.transactionIndex!,
        logIndex: rawVoteEpoch.logIndex!,
        pluginAddress: rawVoteEpoch.pluginAddress!,
      })

      rawVoteEpoch.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.VoteGauge, 'getEntityId')
      const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)

      expect(getEntityIdSpy.called).to.be.false
      expect(createdVoteEpoch.id).to.eq(entityId)
    })

    it('Should create a reset type VoteGauge', async () => {
      const doc = await seedVote({ transactionHash: '0xreset1', type: 'reset', votingPower: '0' })
      expect(doc.type).to.equal('reset')
      expect(doc.votingPower).to.equal('0')
    })

    it('Should fail when network is not present', async () => {
      await expect(
        Models.VoteGauge.create({
          transactionHash: rawVoteEpoch.transactionHash,
          transactionIndex: rawVoteEpoch.transactionIndex,
          logIndex: rawVoteEpoch.logIndex,
          blockNumber: rawVoteEpoch.blockNumber,
          gaugeAddress: rawVoteEpoch.gaugeAddress,
          pluginAddress: rawVoteEpoch.pluginAddress,
          memberAddress: rawVoteEpoch.memberAddress,
          epochId: rawVoteEpoch.epochId,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('Should fail when transactionHash is not present', async () => {
      await expect(
        Models.VoteGauge.create({
          network: rawVoteEpoch.network,
          transactionIndex: rawVoteEpoch.transactionIndex,
          logIndex: rawVoteEpoch.logIndex,
          blockNumber: rawVoteEpoch.blockNumber,
          gaugeAddress: rawVoteEpoch.gaugeAddress,
          pluginAddress: rawVoteEpoch.pluginAddress,
          memberAddress: rawVoteEpoch.memberAddress,
          epochId: rawVoteEpoch.epochId,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('Should fail when transactionIndex is not present', async () => {
      await expect(
        Models.VoteGauge.create({
          network: rawVoteEpoch.network,
          transactionHash: rawVoteEpoch.transactionHash,
          logIndex: rawVoteEpoch.logIndex,
          blockNumber: rawVoteEpoch.blockNumber,
          gaugeAddress: rawVoteEpoch.gaugeAddress,
          pluginAddress: rawVoteEpoch.pluginAddress,
          memberAddress: rawVoteEpoch.memberAddress,
          epochId: rawVoteEpoch.epochId,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('Should fail when logIndex is not present', async () => {
      await expect(
        Models.VoteGauge.create({
          network: rawVoteEpoch.network,
          transactionHash: rawVoteEpoch.transactionHash,
          transactionIndex: rawVoteEpoch.transactionIndex,
          blockNumber: rawVoteEpoch.blockNumber,
          gaugeAddress: rawVoteEpoch.gaugeAddress,
          pluginAddress: rawVoteEpoch.pluginAddress,
          memberAddress: rawVoteEpoch.memberAddress,
          epochId: rawVoteEpoch.epochId,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })

    it('Should allow transactionIndex to be 0', async () => {
      rawVoteEpoch.transactionIndex = 0
      const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
      expect(createdVoteEpoch.transactionIndex).to.eq(0)
    })

    it('Should allow logIndex to be 0', async () => {
      rawVoteEpoch.logIndex = 0
      const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
      expect(createdVoteEpoch.logIndex).to.eq(0)
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.VoteGauge.getEntityId({
      network: NETWORK,
      transactionHash: rawVoteEpoch.transactionHash!,
      transactionIndex: 1,
      logIndex: 2,
      pluginAddress: PLUGIN,
    })
    expect(entityId).to.eq(`${NETWORK}-${rawVoteEpoch.transactionHash}-1-2-${PLUGIN}`)
  })

  it('Should findExistingLog', async () => {
    const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
    const foundVoteEpoch = await Models.VoteGauge.findExistingLog({
      network: createdVoteEpoch.network,
      transactionHash: createdVoteEpoch.transactionHash,
      transactionIndex: createdVoteEpoch.transactionIndex,
      logIndex: createdVoteEpoch.logIndex,
      pluginAddress: createdVoteEpoch.pluginAddress,
    })
    expect(foundVoteEpoch?.id).to.eq(createdVoteEpoch.id)
  })

  it('Should findByEntityId', async () => {
    const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
    const foundVoteEpoch = await Models.VoteGauge.findByEntityId(createdVoteEpoch.id)
    expect(foundVoteEpoch?.id).to.eq(createdVoteEpoch.id)
  })

  it('Should update VoteGauge', async () => {
    const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
    expect(createdVoteEpoch.votingPower).to.eq(rawVoteEpoch.votingPower)

    await createdVoteEpoch.update({ votingPower: '2000000000000000000' })
    expect(createdVoteEpoch.votingPower).to.eq('2000000000000000000')
  })

  it('Should reload', async () => {
    const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
    const reloadedVoteEpoch = await createdVoteEpoch.reload()

    expect(reloadedVoteEpoch.transactionHash).to.eq(rawVoteEpoch.transactionHash)
    expect(reloadedVoteEpoch.network).to.eq(rawVoteEpoch.network)
    expect(reloadedVoteEpoch.epochId).to.eq(rawVoteEpoch.epochId)
  })

  it('Should create VoteGauge without optional fields', async () => {
    const minimalVoteEpoch = {
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      transactionIndex: 0,
      logIndex: 1,
      blockNumber: 12345678,
      network: NETWORK,
      pluginAddress: PLUGIN,
      gaugeAddress: GAUGE_A,
      memberAddress: ALICE,
      epochId: '2',
    }

    const createdVoteEpoch = await Models.VoteGauge.create(minimalVoteEpoch)
    expect(createdVoteEpoch.id).to.exist
    expect(createdVoteEpoch.blockTimestamp).to.be.undefined
    expect(createdVoteEpoch.votingPower).to.be.null
    expect(createdVoteEpoch.type).to.eq('vote')
  })

  describe('persistentVote field', () => {
    it('Should create VoteGauge with persistentVote true', async () => {
      const createdVote = await Models.VoteGauge.create({ ...rawVoteEpoch, persistentVote: true })
      expect(createdVote.persistentVote).to.be.true
    })

    it('Should default persistentVote to false when not provided', async () => {
      const createdVote = await Models.VoteGauge.create(rawVoteEpoch)
      expect(createdVote.persistentVote).to.be.false
    })
  })

  describe('countActiveVotesByEpochAndGauge', () => {
    it('should count unique active voters for an epoch', async () => {
      await seedVote({ memberAddress: ALICE, transactionHash: '0xc1', logIndex: 0, votingPower: '60' })
      await seedVote({ memberAddress: BOB, transactionHash: '0xc2', logIndex: 0, votingPower: '40' })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(2)
    })

    it('should exclude members whose latest VP is 0 (reset)', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xc3',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xc4',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '0',
        type: 'reset',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(0)
    })

    it('should include persistent votes from other epochs', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xc5',
        logIndex: 0,
        epochId: '4',
        persistentVote: true,
        votingPower: '100',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(1)
    })

    it('should return 0 when no votes exist', async () => {
      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('999', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(0)
    })

    it('should filter by network', async () => {
      await seedVote({ memberAddress: ALICE, transactionHash: '0xc6', logIndex: 0, votingPower: '60' })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge(
        '5',
        PLUGIN,
        GAUGE_A,
        NetworksEnum.polygonMainnet,
      )
      expect(count).to.equal(0)
    })

    it('should count voter as active when vote comes after reset (re-vote)', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xr1',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
        type: 'vote',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xr2',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '0',
        type: 'reset',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xr3',
        logIndex: 0,
        blockNumber: 300,
        votingPower: '80',
        type: 'vote',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(1)
    })

    it('should handle multiple voters where one resets and the other stays active', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xmv1',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xmv2',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '0',
        type: 'reset',
      })
      await seedVote({
        memberAddress: BOB,
        transactionHash: '0xmv3',
        logIndex: 0,
        blockNumber: 150,
        votingPower: '40',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(1)
    })

    it('should include persistent votes from earlier epochs alongside current epoch votes', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xpe1',
        logIndex: 0,
        epochId: '3',
        persistentVote: true,
        votingPower: '100',
        blockNumber: 100,
      })
      await seedVote({
        memberAddress: BOB,
        transactionHash: '0xpe2',
        logIndex: 0,
        epochId: '5',
        persistentVote: false,
        votingPower: '50',
        blockNumber: 200,
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(2)
    })

    it('should exclude persistent vote when reset in a later epoch', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xpr1',
        logIndex: 0,
        epochId: '3',
        persistentVote: true,
        votingPower: '100',
        blockNumber: 100,
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xpr2',
        logIndex: 0,
        epochId: '5',
        persistentVote: true,
        votingPower: '0',
        type: 'reset',
        blockNumber: 300,
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(0)
    })

    it('should not count non-persistent votes from other epochs', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xnp1',
        logIndex: 0,
        epochId: '3',
        persistentVote: false,
        votingPower: '100',
        blockNumber: 100,
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(0)
    })

    it('should only count votes for the specified gauge', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xfg1',
        logIndex: 0,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: BOB,
        gaugeAddress: GAUGE_B,
        transactionHash: '0xfg2',
        logIndex: 0,
        votingPower: '40',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(1)
    })

    it('should use latest vote by blockNumber when member votes multiple times', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xmul1',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xmul2',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '120',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(1)
    })

    it('should use logIndex to break ties on same blockNumber', async () => {
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xli1',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
        type: 'vote',
      })
      await seedVote({
        memberAddress: ALICE,
        transactionHash: '0xli2',
        logIndex: 5,
        blockNumber: 100,
        votingPower: '0',
        type: 'reset',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('5', PLUGIN, GAUGE_A, NETWORK)
      expect(count).to.equal(0)
    })
  })

  describe('getMostRecentVoteEvent', () => {
    it('should return the most recent event by blockNumber', async () => {
      await seedVote({ transactionHash: '0xm1', blockNumber: 100, blockTimestamp: 1000 })
      await seedVote({
        transactionHash: '0xm2',
        logIndex: 1,
        blockNumber: 200,
        blockTimestamp: 2000,
        memberAddress: BOB,
      })

      const result = await Models.VoteGauge.getMostRecentVoteEvent(PLUGIN, NETWORK, 3000)

      expect(result).to.exist
      expect(result!.transactionHash).to.equal('0xm2')
    })

    it('should respect timestamp filter', async () => {
      await seedVote({ transactionHash: '0xm3', blockNumber: 100, blockTimestamp: 1000 })
      await seedVote({
        transactionHash: '0xm4',
        logIndex: 1,
        blockNumber: 200,
        blockTimestamp: 2000,
        memberAddress: BOB,
      })

      const result = await Models.VoteGauge.getMostRecentVoteEvent(PLUGIN, NETWORK, 1500)

      expect(result).to.exist
      expect(result!.transactionHash).to.equal('0xm3')
    })

    it('should return null if no events exist', async () => {
      const result = await Models.VoteGauge.getMostRecentVoteEvent(PLUGIN, NETWORK, 3000)
      expect(result).to.be.null
    })
  })

  describe('getPerGaugeVP', () => {
    it('should return total VP per gauge', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg1',
        logIndex: 0,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: BOB,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg2',
        logIndex: 0,
        votingPower: '40',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_B,
        transactionHash: '0xg3',
        logIndex: 0,
        votingPower: '50',
      })

      const result = await Models.VoteGauge.getPerGaugeVP(PLUGIN, NETWORK, 2000)

      expect(result.size).to.equal(2)
      expect(result.get(GAUGE_A)).to.equal(100n)
      expect(result.get(GAUGE_B)).to.equal(50n)
    })

    it('should use latest VP per member-gauge pair', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg4',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg5',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '80',
      })

      const result = await Models.VoteGauge.getPerGaugeVP(PLUGIN, NETWORK, 2000)
      expect(result.get(GAUGE_A)).to.equal(80n)
    })

    it('should exclude members with 0 VP', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg6',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg7',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '0',
        type: 'reset',
      })

      const result = await Models.VoteGauge.getPerGaugeVP(PLUGIN, NETWORK, 2000)
      expect(result.size).to.equal(0)
    })

    it('should return empty map when no data exists', async () => {
      const result = await Models.VoteGauge.getPerGaugeVP(PLUGIN, NETWORK, 2000)
      expect(result.size).to.equal(0)
    })

    it('should respect voteEnd timestamp', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xg8',
        logIndex: 0,
        blockTimestamp: 3000,
        votingPower: '100',
      })

      const result = await Models.VoteGauge.getPerGaugeVP(PLUGIN, NETWORK, 2000)
      expect(result.size).to.equal(0)
    })
  })

  describe('getActiveVoters', () => {
    it('should return active voters with bigint VP conversion', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa1',
        logIndex: 0,
        blockNumber: 100,
        blockTimestamp: 1000,
        votingPower: '60000000000000000000',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].voter).to.equal(ALICE)
      expect(result[0].usedVP).to.equal(60000000000000000000n)
      expect(result[0].latestBlock).to.equal(100)
      expect(result[0].latestBlockTimestamp).to.equal(1000)
    })

    it('should sum VP across multiple gauges for the same voter', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa2',
        logIndex: 0,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_B,
        transactionHash: '0xa3',
        logIndex: 0,
        votingPower: '40',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].usedVP).to.equal(100n)
    })

    it('should exclude voters whose latest VP per gauge is 0 (reset)', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa4',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa5',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '0',
        type: 'reset',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)
      expect(result).to.have.lengthOf(0)
    })

    it('should return multiple active voters sorted by latestBlock desc', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa6',
        logIndex: 0,
        blockNumber: 100,
        blockTimestamp: 1000,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: BOB,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa7',
        logIndex: 0,
        blockNumber: 200,
        blockTimestamp: 2000,
        votingPower: '40',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 3000)

      expect(result).to.have.lengthOf(2)
      expect(result[0].voter).to.equal(BOB)
      expect(result[1].voter).to.equal(ALICE)
    })

    it('should respect voteEnd timestamp', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa8',
        logIndex: 0,
        blockTimestamp: 3000,
        votingPower: '60',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)
      expect(result).to.have.lengthOf(0)
    })

    it('should return empty array when no voters', async () => {
      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)
      expect(result).to.have.lengthOf(0)
    })

    it('should use latest VP per member-gauge pair', async () => {
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa9',
        logIndex: 0,
        blockNumber: 100,
        votingPower: '60',
      })
      await seedVote({
        memberAddress: ALICE,
        gaugeAddress: GAUGE_A,
        transactionHash: '0xa10',
        logIndex: 0,
        blockNumber: 200,
        votingPower: '80',
      })

      const result = await Models.VoteGauge.getActiveVoters(PLUGIN, NETWORK, 2000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].usedVP).to.equal(80n)
    })
  })

  describe('getLatestTxPerGauge', () => {
    it('should return the latest tx per gauge', async () => {
      await seedVote({
        gaugeAddress: GAUGE_A,
        transactionHash: '0xl1',
        logIndex: 0,
        blockNumber: 100,
        blockTimestamp: 1000,
      })
      await seedVote({
        gaugeAddress: GAUGE_A,
        memberAddress: BOB,
        transactionHash: '0xl2',
        logIndex: 0,
        blockNumber: 200,
        blockTimestamp: 2000,
      })
      await seedVote({
        gaugeAddress: GAUGE_B,
        transactionHash: '0xl3',
        logIndex: 0,
        blockNumber: 150,
        blockTimestamp: 1500,
      })

      const result = await Models.VoteGauge.getLatestTxPerGauge(PLUGIN, NETWORK, 3000)

      expect(result).to.have.lengthOf(2)

      const gaugeAResult = result.find((r: any) => r.gaugeAddress === GAUGE_A)
      expect(gaugeAResult).to.exist
      expect(gaugeAResult!.transactionHash).to.equal('0xl2')
      expect(gaugeAResult!.blockNumber).to.equal(200)

      const gaugeBResult = result.find((r: any) => r.gaugeAddress === GAUGE_B)
      expect(gaugeBResult).to.exist
      expect(gaugeBResult!.transactionHash).to.equal('0xl3')
      expect(gaugeBResult!.blockNumber).to.equal(150)
    })

    it('should respect timestamp filter', async () => {
      await seedVote({
        gaugeAddress: GAUGE_A,
        transactionHash: '0xl4',
        logIndex: 0,
        blockNumber: 100,
        blockTimestamp: 1000,
      })
      await seedVote({
        gaugeAddress: GAUGE_A,
        memberAddress: BOB,
        transactionHash: '0xl5',
        logIndex: 0,
        blockNumber: 200,
        blockTimestamp: 3000,
      })

      const result = await Models.VoteGauge.getLatestTxPerGauge(PLUGIN, NETWORK, 2000)

      expect(result).to.have.lengthOf(1)
      expect(result[0].transactionHash).to.equal('0xl4')
    })

    it('should return empty array when no data', async () => {
      const result = await Models.VoteGauge.getLatestTxPerGauge(PLUGIN, NETWORK, 2000)
      expect(result).to.have.lengthOf(0)
    })
  })
})
