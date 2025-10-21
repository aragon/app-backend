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
})
