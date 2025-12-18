import { Models } from '@dbModels'
import PluginRepo from '@models/schema/pluginRepo'
import { FakePluginRepo } from '@test/mock/fakePluginRepo'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Plugin Repo', () => {
  let sandbox: SinonSandbox
  let rawPluginRepo: Partial<PluginRepo>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawPluginRepo = {
      ...FakePluginRepo,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Plugin Repo', async () => {
    it('Should create Plugin', async () => {
      const entityId = Models.PluginRepo.getEntityId({
        network: rawPluginRepo.network!,
        transactionHash: rawPluginRepo.transactionHash!,
        transactionIndex: rawPluginRepo.transactionIndex!,
        logIndex: rawPluginRepo.logIndex!,
      })
      const plugin = await Models.PluginRepo.create(rawPluginRepo)
      expect(plugin.id).to.equal(entityId)
      expect(plugin.network).to.equal(rawPluginRepo.network)
      expect(plugin.transactionHash).to.equal(rawPluginRepo.transactionHash)
      expect(plugin.transactionIndex).to.equal(rawPluginRepo.transactionIndex)
      expect(plugin.logIndex).to.equal(rawPluginRepo.logIndex)
    })

    it('should save without plugin id present', async () => {
      const entityId = Models.PluginRepo.getEntityId({
        network: rawPluginRepo.network!,
        transactionHash: rawPluginRepo.transactionHash!,
        transactionIndex: rawPluginRepo.transactionIndex!,
        logIndex: rawPluginRepo.logIndex!,
      })

      rawPluginRepo.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.PluginRepo, 'getEntityId')
      await Models.PluginRepo.create(rawPluginRepo)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when network is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          transactionHash: rawPluginRepo.transactionHash!,
          transactionIndex: rawPluginRepo.transactionIndex!,
          logIndex: rawPluginRepo.logIndex!,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should fail when transaction hash is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          transactionIndex: rawPluginRepo.transactionIndex!,
          logIndex: rawPluginRepo.logIndex!,
          network: rawPluginRepo.network!,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should fail when transaction index is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          transactionHash: rawPluginRepo.transactionHash!,
          logIndex: rawPluginRepo.logIndex!,
          network: rawPluginRepo.network!,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('should fail when log index is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          transactionHash: rawPluginRepo.transactionHash!,
          transactionIndex: rawPluginRepo.transactionIndex!,
          network: rawPluginRepo.network!,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })
  })

  it('should get entity id', async () => {
    const entityId = Models.PluginRepo.getEntityId({
      network: rawPluginRepo.network!,
      transactionHash: rawPluginRepo.transactionHash!,
      transactionIndex: rawPluginRepo.transactionIndex!,
      logIndex: rawPluginRepo.logIndex!,
    })
    expect(entityId).to.equal(
      `${rawPluginRepo.network}-${rawPluginRepo.transactionHash}-${rawPluginRepo.transactionIndex}-${rawPluginRepo.logIndex}`,
    )
  })

  it('should find existing log', async () => {
    const pluginRepo = await Models.PluginRepo.create(rawPluginRepo)
    const foundPluginRepo = await Models.PluginRepo.findExistingLog({
      network: rawPluginRepo.network!,
      transactionHash: rawPluginRepo.transactionHash!,
      transactionIndex: rawPluginRepo.transactionIndex,
      logIndex: rawPluginRepo.logIndex,
    })
    expect(foundPluginRepo.network).to.be.eq(pluginRepo.network)
    expect(foundPluginRepo.transactionHash).to.be.eq(pluginRepo.transactionHash)
    expect(foundPluginRepo.transactionIndex).to.be.eq(pluginRepo.transactionIndex)
    expect(foundPluginRepo.logIndex).to.be.eq(pluginRepo.logIndex)
  })

  it('should find by entityId', async () => {
    const pluginRepo = await Models.PluginRepo.create(rawPluginRepo)
    const foundPlugin = await Models.PluginRepo.findByEntityId(pluginRepo.id)
    expect(foundPlugin.pluginRepo).to.be.eq(pluginRepo.pluginRepo)
    expect(foundPlugin.transactionHash).to.be.eq(pluginRepo.transactionHash)
  })

  it('should update plugin repo', async () => {
    const plugin = await Models.PluginRepo.create(rawPluginRepo)
    const updatedPlugin = await plugin.update({
      subdomain: 'testing-ens',
    })
    expect(updatedPlugin.subdomain).to.be.eq('testing-ens')
  })

  it('should reload plugin', async () => {
    const pluginRepo = await Models.PluginRepo.create(rawPluginRepo)
    const reloadedPlugin = await pluginRepo.reload()
    expect(reloadedPlugin.pluginRepo).to.be.eq(pluginRepo.pluginRepo)
    expect(reloadedPlugin.transactionHash).to.be.eq(pluginRepo.transactionHash)
  })
})
