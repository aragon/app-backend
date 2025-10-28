import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import VoteGauge from '@models/schema/voteGauge'

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
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0x1111111111111111111111111111111111111111',
      gaugeAddress: '0x2222222222222222222222222222222222222222',
      memberAddress: '0x3333333333333333333333333333333333333333',
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
    })

    it('Should create VoteGauge with id already present', async () => {
      const entityId = Models.VoteGauge.getEntityId({
        network: rawVoteEpoch.network!,
        transactionHash: rawVoteEpoch.transactionHash!,
        transactionIndex: rawVoteEpoch.transactionIndex!,
        logIndex: rawVoteEpoch.logIndex!,
      })

      rawVoteEpoch.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.VoteGauge, 'getEntityId')
      const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)

      expect(getEntityIdSpy.called).to.be.false
      expect(createdVoteEpoch.id).to.eq(entityId)
    })

    it('Should fail when network is not present', async () => {
      await expect(
        Models.VoteGauge.create({
          transactionHash: rawVoteEpoch.transactionHash,
          transactionIndex: rawVoteEpoch.transactionIndex,
          logIndex: rawVoteEpoch.logIndex,
          blockNumber: rawVoteEpoch.blockNumber,
          gaugeAddress: rawVoteEpoch.gaugeAddress,
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
    const transactionHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    const network = NetworksEnum.ethereumMainnet
    const transactionIndex = 1
    const logIndex = 2
    const entityId = Models.VoteGauge.getEntityId({ network, transactionHash, transactionIndex, logIndex })
    expect(entityId).to.eq(`${network}-${transactionHash}-${transactionIndex}-${logIndex}`)
  })

  it('Should findExistingLog', async () => {
    const createdVoteEpoch = await Models.VoteGauge.create(rawVoteEpoch)
    const foundVoteEpoch = await Models.VoteGauge.findExistingLog({
      network: createdVoteEpoch.network,
      transactionHash: createdVoteEpoch.transactionHash,
      transactionIndex: createdVoteEpoch.transactionIndex,
      logIndex: createdVoteEpoch.logIndex,
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
    expect(createdVoteEpoch.resetVoteTransactionHash).to.be.null

    const newResetTxHash = '0x9999999999999999999999999999999999999999999999999999999999999999'
    await createdVoteEpoch.update({
      votingPower: '2000000000000000000',
      resetVoteTransactionHash: newResetTxHash,
    })

    expect(createdVoteEpoch.votingPower).to.eq('2000000000000000000')
    expect(createdVoteEpoch.resetVoteTransactionHash).to.eq(newResetTxHash)
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
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0x1111111111111111111111111111111111111111',
      gaugeAddress: '0x2222222222222222222222222222222222222222',
      memberAddress: '0x3333333333333333333333333333333333333333',
      epochId: '2',
    }

    const createdVoteEpoch = await Models.VoteGauge.create(minimalVoteEpoch)
    expect(createdVoteEpoch.id).to.exist
    expect(createdVoteEpoch.blockTimestamp).to.be.undefined
    expect(createdVoteEpoch.votingPower).to.be.null
    expect(createdVoteEpoch.resetVoteTransactionHash).to.be.null
  })

  describe('countActiveVotesByEpochAndGauge', () => {
    const testGaugeAddress = '0xTestGaugeAddress1111111111111111111111'
    const testNetwork = NetworksEnum.ethereumMainnet

    beforeEach(async () => {
      // Create votes for epoch 1
      await Models.VoteGauge.create({
        transactionHash: '0xTx1111111111111111111111111111111111111111111111111111111111111111',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: testGaugeAddress,
        memberAddress: '0xMember111111111111111111111111111111111',
        epochId: '1',
        votingPower: '1000',
        resetVoteTransactionHash: null,
      })

      await Models.VoteGauge.create({
        transactionHash: '0xTx2222222222222222222222222222222222222222222222222222222222222222',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 101,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: testGaugeAddress,
        memberAddress: '0xMember222222222222222222222222222222222',
        epochId: '1',
        votingPower: '2000',
        resetVoteTransactionHash: null,
      })

      // Create a reset vote (should not be counted)
      await Models.VoteGauge.create({
        transactionHash: '0xTx3333333333333333333333333333333333333333333333333333333333333333',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 102,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: testGaugeAddress,
        memberAddress: '0xMember333333333333333333333333333333333',
        epochId: '1',
        votingPower: '3000',
        resetVoteTransactionHash: '0xResetTx11111111111111111111111111111111111111111111111111111111',
      })

      // Create a persistent vote from epoch 0 (should be counted for epoch 1)
      await Models.VoteGauge.create({
        transactionHash: '0xTx4444444444444444444444444444444444444444444444444444444444444444',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 50,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: testGaugeAddress,
        memberAddress: '0xMember444444444444444444444444444444444',
        epochId: '0',
        votingPower: '4000',
        resetVoteTransactionHash: null,
        persistentVote: true,
      })

      // Create vote for different gauge (should not be counted)
      await Models.VoteGauge.create({
        transactionHash: '0xTx5555555555555555555555555555555555555555555555555555555555555555',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 103,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: '0xDifferentGauge222222222222222222222222',
        memberAddress: '0xMember555555555555555555555555555555555',
        epochId: '1',
        votingPower: '5000',
        resetVoteTransactionHash: null,
      })
    })

    it('Should count active votes for specific epoch and gauge', async () => {
      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('1', testGaugeAddress, testNetwork)

      // Should count:
      // - 2 votes from epoch 1 with resetVoteTransactionHash=null
      // - 1 persistent vote from epoch 0
      // Total: 3
      expect(count).to.eq(3)
    })

    it('Should not count reset votes', async () => {
      // Mark one of the epoch 1 votes as reset
      const voteToReset = await Models.VoteGauge.findOne({
        memberAddress: '0xMember111111111111111111111111111111111',
        epochId: '1',
      })

      await voteToReset!.update({
        resetVoteTransactionHash: '0xResetTx22222222222222222222222222222222222222222222222222222222',
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('1', testGaugeAddress, testNetwork)

      // Should now only count:
      // - 1 vote from epoch 1 (one was reset)
      // - 1 persistent vote from epoch 0
      // Total: 2
      expect(count).to.eq(2)
    })

    it('Should include persistent votes from other epochs', async () => {
      // Create another persistent vote from epoch 2
      await Models.VoteGauge.create({
        transactionHash: '0xTx6666666666666666666666666666666666666666666666666666666666666666',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 200,
        network: testNetwork,
        pluginAddress: '0x1111111111111111111111111111111111111111',
        gaugeAddress: testGaugeAddress,
        memberAddress: '0xMember666666666666666666666666666666666',
        epochId: '2',
        votingPower: '6000',
        resetVoteTransactionHash: null,
        persistentVote: true,
      })

      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('1', testGaugeAddress, testNetwork)

      // Should count:
      // - 2 votes from epoch 1
      // - 2 persistent votes (from epoch 0 and epoch 2)
      // Total: 4
      expect(count).to.eq(4)
    })

    it('Should return 0 when no active votes exist', async () => {
      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge('999', testGaugeAddress, testNetwork)

      // Should only count persistent votes (1 from epoch 0)
      expect(count).to.eq(1)
    })

    it('Should filter by network', async () => {
      const count = await Models.VoteGauge.countActiveVotesByEpochAndGauge(
        '1',
        testGaugeAddress,
        NetworksEnum.polygonMainnet,
      )

      // Should return 0 as all votes are on ethereumMainnet
      expect(count).to.eq(0)
    })
  })

  describe('persistentVote field', () => {
    it('Should create VoteGauge with persistentVote true', async () => {
      const persistentVote = {
        ...rawVoteEpoch,
        persistentVote: true,
      }

      const createdVote = await Models.VoteGauge.create(persistentVote)
      expect(createdVote.persistentVote).to.be.true
    })

    it('Should create VoteGauge with persistentVote false', async () => {
      const nonPersistentVote = {
        ...rawVoteEpoch,
        persistentVote: false,
      }

      const createdVote = await Models.VoteGauge.create(nonPersistentVote)
      expect(createdVote.persistentVote).to.be.false
    })

    it('Should default persistentVote to false when not provided', async () => {
      const createdVote = await Models.VoteGauge.create(rawVoteEpoch)
      expect(createdVote.persistentVote).to.be.false
    })

    it('Should update persistentVote field', async () => {
      const createdVote = await Models.VoteGauge.create(rawVoteEpoch)
      expect(createdVote.persistentVote).to.be.false

      await createdVote.update({ persistentVote: true })
      expect(createdVote.persistentVote).to.be.true

      await createdVote.update({ persistentVote: false })
      expect(createdVote.persistentVote).to.be.false
    })
  })
})
