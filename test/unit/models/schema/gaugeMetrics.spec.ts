import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import GaugeMetrics from '@models/schema/gaugeMetrics'

describe('Model: GaugeMetrics', () => {
  let sandbox: SinonSandbox
  let rawGaugeMetrics: Partial<GaugeMetrics>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawGaugeMetrics = {
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0x1111111111111111111111111111111111111111',
      gaugeAddress: '0x2222222222222222222222222222222222222222',
      daoAddress: '0x3333333333333333333333333333333333333333',
      epochId: '1',
      voteCount: 10,
      votingPower: '1000000000000000000',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create GaugeMetrics', () => {
    it('Should create GaugeMetrics', async () => {
      const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)

      expect(createdMetrics.id).to.exist
      expect(createdMetrics.network).to.eq(rawGaugeMetrics.network)
      expect(createdMetrics.pluginAddress).to.eq(rawGaugeMetrics.pluginAddress)
      expect(createdMetrics.gaugeAddress).to.eq(rawGaugeMetrics.gaugeAddress)
      expect(createdMetrics.daoAddress).to.eq(rawGaugeMetrics.daoAddress)
      expect(createdMetrics.epochId).to.eq(rawGaugeMetrics.epochId)
      expect(createdMetrics.voteCount).to.eq(rawGaugeMetrics.voteCount)
      expect(createdMetrics.votingPower).to.eq(rawGaugeMetrics.votingPower)
    })

    it('Should create GaugeMetrics with id already present', async () => {
      const entityId = Models.GaugeMetrics.getEntityId({
        network: rawGaugeMetrics.network!,
        pluginAddress: rawGaugeMetrics.pluginAddress!,
        gaugeAddress: rawGaugeMetrics.gaugeAddress!,
        epochId: rawGaugeMetrics.epochId!,
      })

      rawGaugeMetrics.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.GaugeMetrics, 'getEntityId')
      const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)

      expect(getEntityIdSpy.called).to.be.false
      expect(createdMetrics.id).to.eq(entityId)
    })

    it('Should fail when network is not present', async () => {
      await expect(
        Models.GaugeMetrics.create({
          pluginAddress: rawGaugeMetrics.pluginAddress,
          gaugeAddress: rawGaugeMetrics.gaugeAddress,
          epochId: rawGaugeMetrics.epochId,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('Should fail when pluginAddress is not present', async () => {
      await expect(
        Models.GaugeMetrics.create({
          network: rawGaugeMetrics.network,
          gaugeAddress: rawGaugeMetrics.gaugeAddress,
          epochId: rawGaugeMetrics.epochId,
        }),
      ).to.be.rejectedWith('pluginAddress is required')
    })

    it('Should fail when gaugeAddress is not present', async () => {
      await expect(
        Models.GaugeMetrics.create({
          network: rawGaugeMetrics.network,
          pluginAddress: rawGaugeMetrics.pluginAddress,
          epochId: rawGaugeMetrics.epochId,
        }),
      ).to.be.rejectedWith('gaugeAddress is required')
    })

    it('Should fail when epochId is not present', async () => {
      await expect(
        Models.GaugeMetrics.create({
          network: rawGaugeMetrics.network,
          pluginAddress: rawGaugeMetrics.pluginAddress,
          gaugeAddress: rawGaugeMetrics.gaugeAddress,
        }),
      ).to.be.rejectedWith('epochId is required')
    })

    it('Should create GaugeMetrics with default values', async () => {
      const minimalMetrics = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x4444444444444444444444444444444444444444',
        gaugeAddress: '0x5555555555555555555555555555555555555555',
        epochId: '2',
      }

      const createdMetrics = await Models.GaugeMetrics.create(minimalMetrics)

      expect(createdMetrics.voteCount).to.eq(0)
      expect(createdMetrics.votingPower).to.eq('0')
      expect(createdMetrics.daoAddress).to.be.undefined
    })
  })

  it('Should getEntityId', async () => {
    const pluginAddress = '0xPlugin123456789012345678901234567890'
    const gaugeAddress = '0xGauge123456789012345678901234567890'
    const network = NetworksEnum.ethereumMainnet
    const epochId = '5'
    const entityId = Models.GaugeMetrics.getEntityId({ network, pluginAddress, gaugeAddress, epochId })
    expect(entityId).to.eq(`${network}-${pluginAddress}-${gaugeAddress}-${epochId}`)
  })

  it('Should findExistingLog', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    const foundMetrics = await Models.GaugeMetrics.findExistingLog({
      network: createdMetrics.network,
      pluginAddress: createdMetrics.pluginAddress!,
      gaugeAddress: createdMetrics.gaugeAddress,
      epochId: createdMetrics.epochId,
    })
    expect(foundMetrics?.id).to.eq(createdMetrics.id)
  })

  it('Should findByEntityId', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    const foundMetrics = await Models.GaugeMetrics.findByEntityId(createdMetrics.id)
    expect(foundMetrics?.id).to.eq(createdMetrics.id)
  })

  it('Should findByGaugeAndEpoch', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    const foundMetrics = await Models.GaugeMetrics.findByGaugeAndEpoch({
      network: createdMetrics.network,
      pluginAddress: createdMetrics.pluginAddress!,
      gaugeAddress: createdMetrics.gaugeAddress,
      epochId: createdMetrics.epochId,
    })

    expect(foundMetrics).to.have.lengthOf(1)
    expect(foundMetrics[0].id).to.eq(createdMetrics.id)
  })

  it('Should update GaugeMetrics', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    expect(createdMetrics.voteCount).to.eq(10)
    expect(createdMetrics.votingPower).to.eq('1000000000000000000')

    await createdMetrics.update({
      voteCount: 25,
      votingPower: '5000000000000000000',
    })

    expect(createdMetrics.voteCount).to.eq(25)
    expect(createdMetrics.votingPower).to.eq('5000000000000000000')
  })

  it('Should not update with same values', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    const saveSpy = sandbox.spy(createdMetrics, 'save')

    await createdMetrics.update({
      voteCount: 10, // Same as original
      votingPower: '1000000000000000000', // Same as original
    })

    // Save should be called once (from update method)
    expect(saveSpy.calledOnce).to.be.true
  })

  it('Should reload', async () => {
    const createdMetrics = await Models.GaugeMetrics.create(rawGaugeMetrics)
    const reloadedMetrics = await createdMetrics.reload()

    expect(reloadedMetrics.gaugeAddress).to.eq(rawGaugeMetrics.gaugeAddress)
    expect(reloadedMetrics.network).to.eq(rawGaugeMetrics.network)
    expect(reloadedMetrics.epochId).to.eq(rawGaugeMetrics.epochId)
  })

  it('Should handle BigInt votingPower values', async () => {
    const largeVotingPower = '99999999999999999999999999999999'
    const metricsWithLargeValue = {
      ...rawGaugeMetrics,
      votingPower: largeVotingPower,
    }

    const createdMetrics = await Models.GaugeMetrics.create(metricsWithLargeValue)
    expect(createdMetrics.votingPower).to.eq(largeVotingPower)

    // Verify it can be retrieved correctly
    const foundMetrics = await Models.GaugeMetrics.findByEntityId(createdMetrics.id)
    expect(foundMetrics?.votingPower).to.eq(largeVotingPower)
  })

  it('Should track multiple epochs for same gauge', async () => {
    const epoch1Data = {
      ...rawGaugeMetrics,
      epochId: '10',
      voteCount: 10,
      votingPower: '1000000000000000000',
    }
    const epoch1 = await Models.GaugeMetrics.create(epoch1Data)

    const epoch2Data = {
      ...rawGaugeMetrics,
      epochId: '11',
      voteCount: 15,
      votingPower: '2000000000000000000',
    }
    const epoch2 = await Models.GaugeMetrics.create(epoch2Data)

    const epoch3Data = {
      ...rawGaugeMetrics,
      epochId: '12',
      voteCount: 20,
      votingPower: '3000000000000000000',
    }
    const epoch3 = await Models.GaugeMetrics.create(epoch3Data)

    expect(epoch1.epochId).to.eq('10')
    expect(epoch2.epochId).to.eq('11')
    expect(epoch3.epochId).to.eq('12')

    // Verify each has different vote counts
    expect(epoch1.voteCount).to.eq(10)
    expect(epoch2.voteCount).to.eq(15)
    expect(epoch3.voteCount).to.eq(20)
  })
})
