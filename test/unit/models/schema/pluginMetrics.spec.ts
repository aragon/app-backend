import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import PluginMetrics from '@models/schema/pluginMetrics'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'

describe('Model: PluginMetrics', () => {
  let sandbox: SinonSandbox
  let rawPluginMetrics: Partial<PluginMetrics>

  before(async () => {
    // Ensure models are loaded when running test directly
    const { ModelProxy } = await import('@src/models')
    await ModelProxy.setMongoModels()
  })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawPluginMetrics = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      pluginAddress: '0xA23456789012345678901234567890123456789B',
      daoAddress: '0xB23456789012345678901234567890123456789C',
      network: NetworksEnum.ethereumMainnet,
      voteCount: 10,
      proposalCount: 5,
      lastActivity: 1234567890,
      firstActivity: 1234567800,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create PluginMetrics', async () => {
    const entityId = Models.PluginMetrics.getEntityId({
      network: rawPluginMetrics.network!,
      memberAddress: rawPluginMetrics.memberAddress!,
      pluginAddress: rawPluginMetrics.pluginAddress!,
    })
    const pluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    expect(pluginMetrics.id).to.eq(entityId)
    expect(pluginMetrics.memberAddress).to.eq(rawPluginMetrics.memberAddress)
    expect(pluginMetrics.pluginAddress).to.eq(rawPluginMetrics.pluginAddress)
    expect(pluginMetrics.daoAddress).to.eq(rawPluginMetrics.daoAddress)
    expect(pluginMetrics.network).to.eq(rawPluginMetrics.network)
    expect(pluginMetrics.voteCount).to.eq(rawPluginMetrics.voteCount)
    expect(pluginMetrics.proposalCount).to.eq(rawPluginMetrics.proposalCount)
    expect(pluginMetrics.lastActivity).to.eq(rawPluginMetrics.lastActivity)
    expect(pluginMetrics.firstActivity).to.eq(rawPluginMetrics.firstActivity)
  })

  it('Should create PluginMetrics with default values', async () => {
    const minimalData = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      pluginAddress: '0xA23456789012345678901234567890123456789B',
      network: NetworksEnum.ethereumMainnet,
    }
    const pluginMetrics = await Models.PluginMetrics.create(minimalData)
    expect(pluginMetrics.voteCount).to.eq(0)
    expect(pluginMetrics.proposalCount).to.eq(0)
    expect(pluginMetrics.lastActivity).to.be.null
    expect(pluginMetrics.firstActivity).to.be.null
    expect(pluginMetrics.daoAddress).to.be.undefined
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      memberAddress: '0xMember',
      pluginAddress: '0xPlugin',
    }
    const entityId = Models.PluginMetrics.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.memberAddress}-${params.pluginAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdPluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    const foundPluginMetrics = await Models.PluginMetrics.findExistingLog({
      network: rawPluginMetrics.network!,
      memberAddress: rawPluginMetrics.memberAddress!,
      pluginAddress: rawPluginMetrics.pluginAddress!,
    })
    expect(foundPluginMetrics?.id).to.eq(createdPluginMetrics.id)
  })

  it('Should findByEntityId', async () => {
    const createdPluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    const foundPluginMetrics = await Models.PluginMetrics.findByEntityId(createdPluginMetrics.id)
    expect(foundPluginMetrics?.id).to.eq(createdPluginMetrics.id)
  })

  it('should findByPluginAndMember', async () => {
    const createdPluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    const pluginMetrics = await Models.PluginMetrics.findByPluginAndMember(
      rawPluginMetrics.network!,
      rawPluginMetrics.pluginAddress!,
      rawPluginMetrics.memberAddress!,
    )
    expect(pluginMetrics?.id).to.eq(createdPluginMetrics.id)
  })

  it('should findByPlugin', async () => {
    await Models.PluginMetrics.create(rawPluginMetrics)
    const anotherMember = {
      ...rawPluginMetrics,
      memberAddress: '0x223456789012345678901234567890123456789A',
    }
    await Models.PluginMetrics.create(anotherMember)

    const pluginMetrics = await Models.PluginMetrics.findByPlugin(
      rawPluginMetrics.network!,
      rawPluginMetrics.pluginAddress!,
    )
    expect(pluginMetrics).to.have.lengthOf(2)
    expect(pluginMetrics[0].pluginAddress).to.eq(rawPluginMetrics.pluginAddress)
    expect(pluginMetrics[1].pluginAddress).to.eq(rawPluginMetrics.pluginAddress)
  })

  it('should findByDao', async () => {
    await Models.PluginMetrics.create(rawPluginMetrics)
    const anotherMember = {
      ...rawPluginMetrics,
      memberAddress: '0x223456789012345678901234567890123456789A',
    }
    await Models.PluginMetrics.create(anotherMember)

    const daoMetrics = await Models.PluginMetrics.findByDao(rawPluginMetrics.network!, rawPluginMetrics.daoAddress!)
    expect(daoMetrics).to.have.lengthOf(2)
    expect(daoMetrics[0].daoAddress).to.eq(rawPluginMetrics.daoAddress)
    expect(daoMetrics[1].daoAddress).to.eq(rawPluginMetrics.daoAddress)
  })

  it('should update PluginMetrics', async () => {
    const pluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    const updatedPluginMetrics = await pluginMetrics.update({
      voteCount: 20,
      proposalCount: 10,
      lastActivity: 1234567900,
    })
    expect(updatedPluginMetrics.voteCount).to.eq(20)
    expect(updatedPluginMetrics.proposalCount).to.eq(10)
    expect(updatedPluginMetrics.lastActivity).to.eq(1234567900)
  })

  it('should update only changed fields', async () => {
    const pluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)

    // Try to update with same values
    const updateSpy = sandbox.spy(pluginMetrics, 'save')
    await pluginMetrics.update({
      voteCount: rawPluginMetrics.voteCount,
      proposalCount: rawPluginMetrics.proposalCount,
    })

    // Save should still be called even if values are the same
    expect(updateSpy.calledOnce).to.be.true
    expect(pluginMetrics.voteCount).to.eq(rawPluginMetrics.voteCount)
    expect(pluginMetrics.proposalCount).to.eq(rawPluginMetrics.proposalCount)
  })

  it('Should reload', async () => {
    const createdPluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    await createdPluginMetrics.reload()

    expect(createdPluginMetrics.memberAddress).to.eq(rawPluginMetrics.memberAddress)
  })

  it('should handle metrics for different networks', async () => {
    await Models.PluginMetrics.create(rawPluginMetrics)

    // Create same member/plugin combination on different network
    const polygonMetrics = {
      ...rawPluginMetrics,
      network: NetworksEnum.polygonMainnet,
      voteCount: 15,
      proposalCount: 8,
    }
    await Models.PluginMetrics.create(polygonMetrics)

    // Find by Ethereum network
    const ethMetrics = await Models.PluginMetrics.findByPluginAndMember(
      rawPluginMetrics.network!,
      rawPluginMetrics.pluginAddress!,
      rawPluginMetrics.memberAddress!,
    )
    expect(ethMetrics?.voteCount).to.eq(10)
    expect(ethMetrics?.network).to.eq(NetworksEnum.ethereumMainnet)

    // Find by Polygon network
    const polyMetrics = await Models.PluginMetrics.findByPluginAndMember(
      NetworksEnum.polygonMainnet,
      rawPluginMetrics.pluginAddress!,
      rawPluginMetrics.memberAddress!,
    )
    expect(polyMetrics?.voteCount).to.eq(15)
    expect(polyMetrics?.network).to.eq(NetworksEnum.polygonMainnet)
  })

  it('should track activity timestamps correctly', async () => {
    const metrics = await Models.PluginMetrics.create({
      ...rawPluginMetrics,
      firstActivity: null,
      lastActivity: null,
    })
    expect(metrics.firstActivity).to.be.null
    expect(metrics.lastActivity).to.be.null

    // Update with activity
    const newActivity = 1234567999
    await metrics.update({
      firstActivity: 1234567800,
      lastActivity: newActivity,
      voteCount: metrics.voteCount + 1,
    })

    expect(metrics.firstActivity).to.eq(1234567800)
    expect(metrics.lastActivity).to.eq(newActivity)
    expect(metrics.voteCount).to.eq(11)
  })
})
