import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginRepo from '@models/schema/pluginRepo'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'
import { FakePluginRepo } from '@test/mock/fakePluginRepo'

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
        transactionHash: rawPluginRepo.transactionHash!,
        pluginRepo: rawPluginRepo.pluginRepo,
      })
      const plugin = await Models.PluginRepo.create(rawPluginRepo)
      expect(plugin.id).to.equal(entityId)
      expect(plugin.transactionHash).to.equal(rawPluginRepo.transactionHash)
      expect(plugin.pluginRepo).to.equal(rawPluginRepo.pluginRepo)
    })

    it('should save without plugin id present', async () => {
      const entityId = Models.PluginRepo.getEntityId({
        transactionHash: rawPluginRepo.transactionHash!,
        pluginRepo: rawPluginRepo.pluginRepo,
      })

      rawPluginRepo.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.PluginRepo, 'getEntityId')
      await Models.PluginRepo.create(rawPluginRepo)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when transaction hash is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          pluginRepo: rawPluginRepo.pluginRepo,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should fail when plugin repo is not present', async () => {
      await expect(
        Models.PluginRepo.create({
          transactionHash: rawPluginRepo.transactionHash,
        }),
      ).to.be.rejectedWith('pluginRepo is required')
    })
  })

  it('should get entity id', async () => {
    const entityId = Models.PluginRepo.getEntityId({
      transactionHash: rawPluginRepo.transactionHash!,
      pluginRepo: rawPluginRepo.pluginRepo,
    })
    expect(entityId).to.equal(`${rawPluginRepo.transactionHash}-${rawPluginRepo.pluginRepo}`)
  })

  it('should find existing log', async () => {
    const pluginRepo = await Models.PluginRepo.create(rawPluginRepo)
    const foundPluginRepo = await Models.PluginRepo.findExistingLog({
      transactionHash: rawPluginRepo.transactionHash!,
      pluginRepo: rawPluginRepo.pluginRepo,
    })
    expect(foundPluginRepo.pluginRepo).to.be.eq(pluginRepo.pluginRepo)
    expect(foundPluginRepo.transactionHash).to.be.eq(pluginRepo.transactionHash)
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
