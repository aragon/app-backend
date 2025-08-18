import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginSlug } from '@helpers/pluginSlug'
import { IPluginInterfaceType, IPluginSlug, IPluginStatus, NetworksEnum } from '@types'
import type Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import Logger from '@logger'
import logger from '@logger'

describe('Helpers:PluginSlug', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
    await Models.Plugin.deleteMany({})
    await Models.PluginSlug.deleteMany({})
  })

  describe('Generic Tests', () => {
    let plugin: Plugin
    let plugin2: Plugin
    let plugin3: Plugin
    let plugin4: Plugin

    beforeEach(async () => {
      plugin = await Models.Plugin.create({
        id: 'test-plugin-1',
        address: '0x121',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc1',
        blockNumber: 1,
      })
      plugin2 = await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x122',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 1,
      })
      plugin3 = await Models.Plugin.create({
        id: 'test-plugin-3',
        address: '0x123',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.spp,
        status: IPluginStatus.installed,
        transactionHash: '0xabc3',
        blockNumber: 1,
      })
      plugin4 = await Models.Plugin.create({
        id: 'test-plugin-4',
        address: '0x124',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        transactionHash: '0xabc4',
        blockNumber: 1,
      })
    })

    it('should return default processKey', async () => {
      expect(await PluginSlug.generateSlug(plugin, IPluginSlug.spp as any)).to.equal(IPluginSlug.spp)
      expect(await PluginSlug.generateSlug(plugin2, IPluginSlug.admin as any)).to.equal(IPluginSlug.admin)
      expect(await PluginSlug.generateSlug(plugin3, IPluginSlug.tokenvoting as any)).to.equal(IPluginSlug.tokenvoting)
      expect(await PluginSlug.generateSlug(plugin4, IPluginSlug.multisig as any)).to.equal(IPluginSlug.multisig)
    })

    it('should return default processKey', async () => {
      expect(await PluginSlug.generateSlug(plugin, undefined as any)).to.equal(IPluginSlug.tokenvoting)
      expect(await PluginSlug.generateSlug(plugin2, undefined as any)).to.equal(IPluginSlug.multisig)
      expect(await PluginSlug.generateSlug(plugin3, undefined as any)).to.equal(IPluginSlug.spp)
      expect(await PluginSlug.generateSlug(plugin4, undefined as any)).to.equal(IPluginSlug.admin)
    })

    it('should return default processKey on multiple plugins', async () => {
      const newPlugin2 = await plugin2.update({ interfaceType: IPluginInterfaceType.tokenVoting })
      const newPlugin3 = await plugin3.update({ interfaceType: IPluginInterfaceType.tokenVoting })

      expect(await PluginSlug.generateSlug(plugin, undefined as any)).to.equal(IPluginSlug.tokenvoting)
      expect(await PluginSlug.generateSlug(newPlugin2, undefined as any)).to.equal(`${IPluginSlug.tokenvoting}_1`)
      expect(await PluginSlug.generateSlug(newPlugin3, undefined as any)).to.equal(`${IPluginSlug.tokenvoting}_2`)
    })

    it('should return default processKey', async () => {
      expect(await PluginSlug.generateSlug(plugin, 'test' as any)).to.equal('test')
      expect(await PluginSlug.generateSlug(plugin2, 'test' as any)).to.equal('test_1')
      expect(await PluginSlug.generateSlug(plugin3, 'test' as any)).to.equal('test_2')
      expect(await PluginSlug.generateSlug(plugin4, 'test' as any)).to.equal('test_3')
    })

    it('should set and update', async () => {
      expect(await PluginSlug.generateSlug(plugin, 'test' as any)).to.equal('test')
      expect(await PluginSlug.updateSlug(plugin, 'test2' as any)).to.equal('test2')
    })

    it('should skip if processKey is the same', async () => {
      expect(await PluginSlug.generateSlug(plugin, 'test' as any)).to.equal('test')
      expect(await PluginSlug.updateSlug(plugin, 'test' as any)).to.equal('test')
    })

    it('should not update not existing', async () => {
      expect(await PluginSlug.updateSlug(plugin, 'test' as any)).to.equal(null)
    })

    it('should not update non-alphanumeric characters', async () => {
      expect(await PluginSlug.generateSlug(plugin, 'test' as any)).to.equal('test')
      expect(await PluginSlug.generateSlug(plugin2, 'test' as any)).to.equal('test_1')
      expect(await PluginSlug.updateSlug(plugin, 'test_1' as any)).to.equal('test1')
    })
  })

  describe('_defaultSlug', () => {
    it('should return correct IPluginSlug for spp interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.spp } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.spp)
    })

    it('should return correct IPluginSlug for lockToVote interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.lockToVote } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.locktovote)
    })

    it('should return correct IPluginSlug for tokenVoting interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.tokenVoting } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.tokenvoting)
    })

    it('should return correct IPluginSlug for multisig interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.multisig } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.multisig)
    })

    it('should return correct IPluginSlug for admin interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.admin } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.admin)
    })

    it('should return correct IPluginSlug for gauge interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.gauge } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.equal(IPluginSlug.gauge)
    })

    it('should return null for unrecognized interface type', () => {
      const plugin = { interfaceType: IPluginInterfaceType.unknown } as any
      const result = PluginSlug._defaultSlug(plugin)
      expect(result).to.be.null
    })
  })

  describe('generateSlug', () => {
    let plugin: Plugin
    let plugin2: Plugin

    beforeEach(async () => {
      plugin = await Models.Plugin.create({
        id: 'test-plugin-1',
        address: '0x121',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc1',
        blockNumber: 1,
      })
      plugin2 = await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x122',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 1,
      })
    })

    afterEach(async () => {
      await Models.Plugin.deleteMany({})
      await Models.PluginSlug.deleteMany({})
    })

    it('should generate default slug when processKey is null', async () => {
      const slug = await PluginSlug.generateSlug(plugin, null as any)
      expect(slug).to.equal(IPluginSlug.tokenvoting)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(
        plugin.daoAddress,
        IPluginSlug.tokenvoting,
        plugin.network,
      )
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(IPluginSlug.tokenvoting)
    })

    it('should skip if already exists', async () => {
      const slug = await PluginSlug.generateSlug(plugin, null as any)
      expect(slug).to.equal(IPluginSlug.tokenvoting)

      const slug2 = await PluginSlug.generateSlug(plugin, null as any)
      expect(slug2).to.equal(IPluginSlug.tokenvoting)
    })

    it('should generate default slug if processKey is not provided and not existing', async () => {
      const slug = await PluginSlug.generateSlug(plugin)
      expect(slug).to.equal(IPluginSlug.tokenvoting)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, slug!, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(slug)
    })

    it('should generate unique slug if default slug already exists', async () => {
      const baseKey = IPluginSlug.tokenvoting

      const slug0 = await PluginSlug.generateSlug(plugin, baseKey)
      expect(slug0).to.equal(`${baseKey}`)

      const slug = await PluginSlug.generateSlug(plugin2 as any, baseKey)
      expect(slug).to.equal(`${baseKey}_1`)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, slug!, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(slug)
    })

    it('should handle concurrent slug generation', async () => {
      const baseKey = IPluginSlug.tokenvoting

      const results = (await Promise.all([
        PluginSlug.generateSlug(plugin, baseKey),
        PluginSlug.generateSlug(plugin2, baseKey),
        PluginSlug.generateSlug(plugin2, baseKey),
      ])) as any

      // Count occurrences of each slug
      const slugCounts = results.reduce(
        (acc, slug) => {
          acc[slug] = (acc[slug] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      // Should have exactly 2 unique slugs
      const uniqueSlugs = Object.keys(slugCounts)
      expect(uniqueSlugs).to.have.lengthOf(2, 'Should have exactly 2 unique slugs')
      expect(uniqueSlugs).to.include(baseKey)
      expect(uniqueSlugs).to.include(`${baseKey}_1`)

      // One slug should appear twice (plugin2's calls), one should appear once (plugin's call)
      const counts = Object.values(slugCounts)
      expect(counts).to.include(2, 'One slug should appear twice (for plugin2)')
      expect(counts).to.include(1, 'One slug should appear once (for plugin)')
    })

    it('should generate default slug if processKey is not provided and not existing', async () => {
      const slug = await PluginSlug.generateSlug(plugin)
      expect(slug).to.equal(IPluginSlug.tokenvoting)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, slug, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(slug)
    })

    it('should generate unique slug if default slug already exists', async () => {
      const baseKey = IPluginSlug.tokenvoting

      await Models.PluginSlug.create({
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        pluginAddress: '0x124',
        slug: baseKey,
      })

      const slug = await PluginSlug.generateSlug(plugin)
      expect(slug).to.equal(`${baseKey}_1`)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, slug, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(slug)
    })

    it('should generate unique slug when processKey is provided and already exists', async () => {
      const processKey = 'customslug'

      await Models.PluginSlug.create({
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        pluginAddress: '0x124',
        slug: processKey,
      })

      const slug = await PluginSlug.generateSlug(plugin, processKey)
      expect(slug).to.equal(`${processKey}_1`)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, slug, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(slug)
    })

    it('should sanitize slugs with special characters', async () => {
      const processKey = 'Token Voting!@#'
      const sanitizedKey = 'tokenvoting'

      const slug = await PluginSlug.generateSlug(plugin, processKey)
      expect(slug).to.equal(sanitizedKey)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, sanitizedKey, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(sanitizedKey)
    })

    it('should handle undefined processKey', async () => {
      const processKey = undefined
      const expectedSlug = IPluginSlug.tokenvoting

      const slug = await PluginSlug.generateSlug(plugin, processKey as any)
      expect(slug).to.equal(expectedSlug)

      const storedSlug = await Models.PluginSlug.findExistingSlugInDao(plugin.daoAddress, expectedSlug, plugin.network)
      expect(storedSlug).to.not.be.null
      expect(storedSlug?.slug).to.equal(expectedSlug)
    })

    it('should return default processKey when process key is wrong', async () => {
      const processKey = { key: 'value' }
      const storedSlug = await PluginSlug.generateSlug(plugin, processKey as any)
      expect(storedSlug).to.equal(IPluginSlug.tokenvoting)
    })

    it('should return null when plugin has unsupported interface type', async () => {
      const unsupportedPlugin = await Models.Plugin.create({
        id: 'test-plugin-unsupported',
        address: '0x130',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.unknown,
        status: IPluginStatus.installed,
        transactionHash: '0xabc130',
        blockNumber: 1,
      })

      const result = await PluginSlug.generateSlug(unsupportedPlugin)
      expect(result).to.be.null
    })

    it('should handle error when _createSlugWithRetries throws for default slug', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      sandbox.stub(PluginSlug, '_createSlugWithRetries').rejects(new Error('Create slug failed'))

      const result = await PluginSlug.generateSlug(plugin)

      expect(result).to.be.null
      expect(errorStub.called).to.be.true
    })

    it('should handle error when _createSlugWithRetries throws for parameterized slug', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      sandbox.stub(PluginSlug, '_createSlugWithRetries').rejects(new Error('Create slug failed'))

      const result = await PluginSlug.generateSlug(plugin, 'custom')

      expect(result).to.be.null
      expect(errorStub.calledWith('Error reserving parameterized slug' as any)).to.be.true
    })
  })

  describe('deleteSlug', () => {
    let pluginToDelete: Plugin

    beforeEach(async () => {
      pluginToDelete = await Models.Plugin.create({
        id: 'test-plugin-delete',
        address: '0x125',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc5',
        blockNumber: 1,
      })

      await PluginSlug.generateSlug(pluginToDelete, 'deletetest')
    })

    it('should delete a PluginSlug successfully', async () => {
      const slug = 'deletetest'

      const existingSlug = await Models.PluginSlug.findExistingSlugInDao(
        pluginToDelete.daoAddress,
        slug,
        pluginToDelete.network,
      )
      expect(existingSlug).to.not.be.null

      const wasDeleted = await PluginSlug.deleteSlug(pluginToDelete)
      expect(wasDeleted).to.be.true

      const deletedSlug = await Models.PluginSlug.findExistingSlugInDao(
        pluginToDelete.daoAddress,
        slug,
        pluginToDelete.network,
      )
      expect(deletedSlug).to.be.null
    })

    it('should return false when trying to delete a non-existent PluginSlug', async () => {
      const nonExistentPlugin = await Models.Plugin.create({
        id: 'test-plugin-nonexistent',
        address: '0x126',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        transactionHash: '0xabc6',
        blockNumber: 1,
      })

      const wasDeleted = await PluginSlug.deleteSlug(nonExistentPlugin)
      expect(wasDeleted).to.be.false
    })

    it('should handle deletion when multiple slugs exist with different criteria', async () => {
      const anotherPlugin = await Models.Plugin.create({
        id: 'test-plugin-2-delete',
        address: '0x127',
        daoAddress: '0xDAO2',
        network: NetworksEnum.polygonMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        transactionHash: '0xabc7',
        blockNumber: 1,
      })

      await PluginSlug.generateSlug(anotherPlugin, 'deletetest')

      const slug1 = 'deletetest'
      const slug2 = 'deletetest'

      const existingSlug1 = await Models.PluginSlug.findExistingSlugInDao(
        pluginToDelete.daoAddress,
        slug1,
        pluginToDelete.network,
      )
      const existingSlug2 = await Models.PluginSlug.findExistingSlugInDao(
        anotherPlugin.daoAddress,
        slug2,
        anotherPlugin.network,
      )
      expect(existingSlug1).to.not.be.null
      expect(existingSlug2).to.not.be.null

      const wasDeleted1 = await PluginSlug.deleteSlug(pluginToDelete)
      expect(wasDeleted1).to.be.true

      const deletedSlug1 = await Models.PluginSlug.findExistingSlugInDao(
        pluginToDelete.daoAddress,
        slug1,
        pluginToDelete.network,
      )
      expect(deletedSlug1).to.be.null

      const existingSlug2After = await Models.PluginSlug.findExistingSlugInDao(
        anotherPlugin.daoAddress,
        slug2,
        anotherPlugin.network,
      )
      expect(existingSlug2After).to.not.be.null
    })

    it('should handle errors gracefully and return false', async () => {
      sandbox.stub(Models.PluginSlug, 'deleteOne').throws(new Error('Database error'))
      const stubError = sandbox.stub(Logger, 'error')

      const wasDeleted = await PluginSlug.deleteSlug(pluginToDelete)
      expect(wasDeleted).to.be.false

      expect(stubError.calledOnce).to.be.true
    })
  })

  describe('updateSlug', () => {
    let pluginToUpdate: Plugin

    beforeEach(async () => {
      pluginToUpdate = await Models.Plugin.create({
        id: 'test-plugin-update',
        address: '0x128',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        transactionHash: '0xabc8',
        blockNumber: 1,
      })

      await PluginSlug.generateSlug(pluginToUpdate, 'updatetest')
    })

    it('should update the slug successfully', async () => {
      const newProcessKey = 'updatedslug'

      const updateResult = await PluginSlug.updateSlug(pluginToUpdate, newProcessKey)
      expect(updateResult).to.equal(newProcessKey)

      const newSlug = await Models.PluginSlug.findExistingSlugInDao(
        pluginToUpdate.daoAddress,
        newProcessKey,
        pluginToUpdate.network,
      )
      expect(newSlug).to.not.be.null
      expect(newSlug?.slug).to.equal(newProcessKey)

      const oldSlug = await Models.PluginSlug.findExistingSlugInDao(
        pluginToUpdate.daoAddress,
        'updatetest',
        pluginToUpdate.network,
      )
      expect(oldSlug).to.be.null
    })

    it('should handle updating to an existing slug by appending suffix', async () => {
      const conflictingSlug = 'conflictslug'

      const conflictingPlugin = await Models.Plugin.create({
        id: 'test-plugin-conflict',
        address: '0x129',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        transactionHash: '0xabc9',
        blockNumber: 1,
      })

      await PluginSlug.generateSlug(conflictingPlugin, conflictingSlug)

      const updateResult = await PluginSlug.updateSlug(pluginToUpdate, conflictingSlug)
      expect(updateResult).to.eq(`${conflictingSlug}_1`)

      const updatedSlug = await Models.PluginSlug.findExistingSlugInDao(
        pluginToUpdate.daoAddress,
        `${conflictingSlug}_1`,
        pluginToUpdate.network,
      )
      expect(updatedSlug).to.not.be.null
      expect(updatedSlug?.slug).to.equal(`${conflictingSlug}_1`)

      const existingConflictSlug = await Models.PluginSlug.findExistingSlugInDao(
        conflictingPlugin.daoAddress,
        conflictingSlug,
        conflictingPlugin.network,
      )
      expect(existingConflictSlug).to.not.be.null
      expect(existingConflictSlug?.slug).to.equal(conflictingSlug)
    })

    it('should return null if PluginSlug does not exist for update', async () => {
      const nonExistentPlugin = await Models.Plugin.create({
        id: 'test-plugin-nonexistent-update',
        address: '0x12A',
        daoAddress: '0xDAO3',
        network: NetworksEnum.polygonMainnet,
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        transactionHash: '0xabca',
        blockNumber: 1,
      })

      const updateResult = await PluginSlug.updateSlug(nonExistentPlugin, 'newslug')
      expect(updateResult).to.be.null
    })

    it('should return null if processKey is invalid', async () => {
      const processKey = { key: 'value' }

      const updateResult = await PluginSlug.updateSlug(pluginToUpdate, processKey as any)
      expect(updateResult).to.be.null
    })

    it('should handle errors gracefully and return null', async () => {
      const newProcessKey = 'updatedslug'

      const updateSlugStub = sandbox.stub(PluginSlug, '_updateSlugWithRetries').throws(new Error('Transaction error'))

      const updateResult = await PluginSlug.updateSlug(pluginToUpdate, newProcessKey)
      expect(updateResult).to.be.null

      expect(updateSlugStub.calledOnce).to.be.true
      expect(updateSlugStub.args[0][0]).to.eq(newProcessKey)
      expect(updateSlugStub.args[0][1]).to.eq(pluginToUpdate)
    })
  })

  describe('_createSlugWithRetries', () => {
    let plugin: Plugin

    beforeEach(async () => {
      plugin = await Models.Plugin.create({
        id: 'test-plugin-retries',
        address: '0x140',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcdef',
        blockNumber: 1,
      })
    })

    afterEach(async () => {
      await Models.PluginSlug.deleteMany({})
    })

    it('should return existing slug if it already exists', async () => {
      const existingSlug = 'existing-slug'

      await Models.PluginSlug.create({
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        slug: existingSlug,
      })

      const findPluginSlugStub = sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({
        slug: existingSlug,
      } as any)

      const result = await PluginSlug._createSlugWithRetries(existingSlug, plugin)

      expect(result).to.equal(existingSlug)
      expect(findPluginSlugStub.calledOnce).to.be.true
    })

    it('should successfully create a new slug when there is no existing slug', async () => {
      const newSlug = 'new-slug'

      const findPluginSlugStub = sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      const createStub = sandbox.stub(Models.PluginSlug, 'create').resolves()

      const result = await PluginSlug._createSlugWithRetries(newSlug, plugin)

      expect(result).to.equal(newSlug)
      expect(findPluginSlugStub.calledOnce).to.be.true
      expect(createStub.calledOnce).to.be.true
    })

    it('should return null and log an error when encountering an unexpected database error', async () => {
      const baseSlug = 'error-slug'

      const findPluginSlugStub = sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      const createStub = sandbox.stub(Models.PluginSlug, 'create').throws(new Error('Unexpected error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await PluginSlug._createSlugWithRetries(baseSlug, plugin)

      expect(result).to.be.null
      expect(findPluginSlugStub.calledOnce).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should handle error code 112 (concurrency error) and continue', async () => {
      const baseSlug = 'concurrency-slug'
      const warnStub = sandbox.stub(logger, 'warn')

      const findPluginSlugStub = sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      const error112 = new Error('Write conflict')
      ;(error112 as any).code = 112

      const createStub = sandbox
        .stub(Models.PluginSlug, 'create')
        .onFirstCall()
        .rejects(error112)
        .onSecondCall()
        .resolves()

      const result = await PluginSlug._createSlugWithRetries(baseSlug, plugin, 2)

      expect(result).to.equal(baseSlug)
      expect(warnStub.calledWith('Encountered error code 112, skipping' as any)).to.be.true
      expect(findPluginSlugStub.calledTwice).to.be.true
      expect(createStub.calledTwice).to.be.true
    })

    it('should return null after maximum retries exceeded', async () => {
      const baseSlug = 'max-retries-slug'
      const errorStub = sandbox.stub(logger, 'error')

      const findPluginSlugStub = sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)
      const duplicateError = new Error('Duplicate key')
      ;(duplicateError as any).code = 11000

      const createStub = sandbox.stub(Models.PluginSlug, 'create').rejects(duplicateError)

      const result = await PluginSlug._createSlugWithRetries(baseSlug, plugin, 2)

      expect(result).to.be.null
      expect(errorStub.calledWith('Failed to generate unique slug after maximum retries' as any)).to.be.true
      expect(createStub.calledTwice).to.be.true
    })
  })

  describe('_updateSlugWithRetries', () => {
    let plugin: Plugin
    let pluginSlug: any

    beforeEach(async () => {
      plugin = await Models.Plugin.create({
        id: 'test-plugin-update-retries',
        address: '0x150',
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcdef',
        blockNumber: 1,
      })

      pluginSlug = {
        update: sandbox.stub(),
        slug: 'old-slug',
      }
    })

    it('should handle error code 112 (concurrency error) during update', async () => {
      const newSlug = 'update-concurrency-slug'
      const warnStub = sandbox.stub(logger, 'warn')

      const error112 = new Error('Write conflict')
      ;(error112 as any).code = 112

      pluginSlug.update.onFirstCall().rejects(error112).onSecondCall().resolves()

      const result = await PluginSlug._updateSlugWithRetries(newSlug, plugin, pluginSlug, 2)

      expect(result).to.equal(newSlug)
      expect(warnStub.calledWith('Encountered error code 112, skipping' as any)).to.be.true
      expect(pluginSlug.update.calledTwice).to.be.true
    })

    it('should return null after maximum retries exceeded during update', async () => {
      const newSlug = 'update-max-retries-slug'
      const errorStub = sandbox.stub(logger, 'error')

      const duplicateError = new Error('Duplicate key')
      ;(duplicateError as any).code = 11000

      pluginSlug.update.rejects(duplicateError)

      const result = await PluginSlug._updateSlugWithRetries(newSlug, plugin, pluginSlug, 2)

      expect(result).to.be.null
      expect(errorStub.calledWith('Failed to update slug after maximum retries' as any)).to.be.true
      expect(pluginSlug.update.calledTwice).to.be.true
    })

    it('should handle unexpected error during update', async () => {
      const newSlug = 'update-error-slug'
      const errorStub = sandbox.stub(logger, 'error')

      const unexpectedError = new Error('Unexpected database error')
      pluginSlug.update.rejects(unexpectedError)

      const result = await PluginSlug._updateSlugWithRetries(newSlug, plugin, pluginSlug, 2)

      expect(result).to.be.null
      expect(errorStub.calledWith('Error updating slug' as any)).to.be.true
      expect(pluginSlug.update.calledOnce).to.be.true
    })
  })
})
