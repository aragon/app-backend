import { Models } from '@dbModels'
import PluginMetrics from '@models/schema/pluginMetrics'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: PluginMetrics', () => {
  let sandbox: SinonSandbox
  let rawPluginMetrics: Partial<PluginMetrics>

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

  afterEach(async () => {
    sandbox?.restore()
    // Clean up database to prevent duplicate key errors
    await Models.PluginMetrics.deleteMany({})
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
    // Use unique addresses for this test
    const testPlugin = '0xC23456789012345678901234567890123456789D'
    const member1 = { ...rawPluginMetrics, pluginAddress: testPlugin }
    const member2 = {
      ...rawPluginMetrics,
      memberAddress: '0x223456789012345678901234567890123456789A',
      pluginAddress: testPlugin,
    }
    await Models.PluginMetrics.create(member1)
    await Models.PluginMetrics.create(member2)

    const pluginMetrics = await Models.PluginMetrics.findByPlugin(rawPluginMetrics.network!, testPlugin)
    expect(pluginMetrics).to.have.lengthOf(2)
    expect(pluginMetrics[0].pluginAddress).to.eq(testPlugin)
    expect(pluginMetrics[1].pluginAddress).to.eq(testPlugin)
  })

  it('should findByDao', async () => {
    // Use unique addresses for this test
    const testDao = '0xD23456789012345678901234567890123456789E'
    const testPlugin1 = '0xE23456789012345678901234567890123456789F'
    const testPlugin2 = '0xF234567890123456789012345678901234567890'
    const member1 = { ...rawPluginMetrics, daoAddress: testDao, pluginAddress: testPlugin1 }
    const member2 = {
      ...rawPluginMetrics,
      memberAddress: '0x323456789012345678901234567890123456789B',
      daoAddress: testDao,
      pluginAddress: testPlugin2,
    }
    await Models.PluginMetrics.create(member1)
    await Models.PluginMetrics.create(member2)

    const daoMetrics = await Models.PluginMetrics.findByDao(rawPluginMetrics.network!, testDao)
    expect(daoMetrics).to.have.lengthOf(2)
    expect(daoMetrics[0].daoAddress).to.eq(testDao)
    expect(daoMetrics[1].daoAddress).to.eq(testDao)
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

  it('Should not update required field with falsy value', async () => {
    const pluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)
    const originalMemberAddress = pluginMetrics.memberAddress

    // Try to update required field with null - should not update
    await pluginMetrics.update({
      memberAddress: null as any,
    })

    expect(pluginMetrics.memberAddress).to.eq(originalMemberAddress)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const pluginMetrics = await Models.PluginMetrics.create(rawPluginMetrics)

    // Try to update with non-existent field
    await pluginMetrics.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(pluginMetrics).to.exist
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
    // Use unique addresses for this test
    const testMember = '0x423456789012345678901234567890123456789C'
    const testPlugin = '0x523456789012345678901234567890123456789D'
    const ethMetricsData = {
      ...rawPluginMetrics,
      memberAddress: testMember,
      pluginAddress: testPlugin,
    }
    await Models.PluginMetrics.create(ethMetricsData)

    // Create same member/plugin combination on different network
    const polygonMetrics = {
      ...rawPluginMetrics,
      memberAddress: testMember,
      pluginAddress: testPlugin,
      network: NetworksEnum.polygonMainnet,
      voteCount: 15,
      proposalCount: 8,
    }
    await Models.PluginMetrics.create(polygonMetrics)

    // Find by Ethereum network
    const ethMetrics = await Models.PluginMetrics.findByPluginAndMember(
      NetworksEnum.ethereumMainnet,
      testPlugin,
      testMember,
    )
    expect(ethMetrics?.voteCount).to.eq(10)
    expect(ethMetrics?.network).to.eq(NetworksEnum.ethereumMainnet)

    // Find by Polygon network
    const polyMetrics = await Models.PluginMetrics.findByPluginAndMember(
      NetworksEnum.polygonMainnet,
      testPlugin,
      testMember,
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
