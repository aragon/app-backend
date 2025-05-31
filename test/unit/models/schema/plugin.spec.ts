import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'
import { PluginList } from '@test/mock/fakePlugins'
import { IPluginInterfaceType, IPluginSlug, NetworksEnum } from '@types'

describe('Model: Plugin', () => {
  let sandbox: SinonSandbox
  let rawPlugin: Partial<Plugin>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawPlugin = {
      ...PluginList[0],
      interfaceType: IPluginInterfaceType.multisig,
      hasTarget: true,
      votingEscrow: {
        curveAddress: '0xCurveAddress',
        exitQueueAddress: '0xExitQueueAddress',
        escrowAddress: '0xEscrowAddress',
        clockAddress: '0xClockAddress',
        nftLockAddress: '0xNftLockAddress',
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Plugin', async () => {
    it('Should create Plugin', async () => {
      const entityId = Models.Plugin.getEntityId({
        transactionHash: rawPlugin.transactionHash!,
        address: rawPlugin.address,
        network: rawPlugin.network,
      })
      const plugin = await Models.Plugin.create(rawPlugin)
      expect(plugin.id).to.equal(entityId)
      expect(plugin.transactionHash).to.equal(rawPlugin.transactionHash)
      expect(plugin.address).to.equal(rawPlugin.address)
      expect(plugin.network).to.equal(rawPlugin.network)
      expect(plugin.votingEscrow.curveAddress).to.equal(rawPlugin?.votingEscrow?.curveAddress)
      expect(plugin.votingEscrow.exitQueueAddress).to.equal(rawPlugin?.votingEscrow?.exitQueueAddress)
      expect(plugin.votingEscrow.escrowAddress).to.equal(rawPlugin?.votingEscrow?.escrowAddress)
      expect(plugin.votingEscrow.clockAddress).to.equal(rawPlugin?.votingEscrow?.clockAddress)
      expect(plugin.votingEscrow.nftLockAddress).to.equal(rawPlugin?.votingEscrow?.nftLockAddress)
      expect(plugin.hasTarget).to.be.true
    })

    it('should save without plugin id present', async () => {
      const entityId = Models.Plugin.getEntityId({
        transactionHash: rawPlugin.transactionHash!,
        address: rawPlugin.address,
        network: rawPlugin.network,
      })

      rawPlugin.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.Plugin, 'getEntityId')
      await Models.Plugin.create(rawPlugin)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when address is not present', async () => {
      await expect(
        Models.Plugin.create({
          transactionHash: rawPlugin.transactionHash,
          network: rawPlugin.network,
        }),
      ).to.be.rejectedWith('address is required')
    })

    it('should fail when network is not present', async () => {
      await expect(
        Models.Plugin.create({
          transactionHash: rawPlugin.transactionHash,
          address: rawPlugin.address,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should fail when transactionHash is not present', async () => {
      await expect(
        Models.Plugin.create({
          address: rawPlugin.address,
          network: rawPlugin.network,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })
  })

  it('should get entity id', async () => {
    const entityId = Models.Plugin.getEntityId({
      transactionHash: rawPlugin.transactionHash!,
      address: rawPlugin.address,
      network: rawPlugin.network,
    })
    expect(entityId).to.equal(`${rawPlugin.network}-${rawPlugin.transactionHash}-${rawPlugin.address}`)
  })

  it('should find existing log', async () => {
    const plugin = await Models.Plugin.create(rawPlugin)
    const foundPlugin = await Models.Plugin.findExistingLog({
      network: rawPlugin.network,
      transactionHash: rawPlugin.transactionHash!,
      address: rawPlugin.address,
    })
    expect(foundPlugin.network).to.be.eq(plugin.network)
    expect(foundPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(foundPlugin.address).to.be.eq(plugin.address)
  })

  it('should find by entityId', async () => {
    const plugin = await Models.Plugin.create(rawPlugin)
    const foundPlugin = await Models.Plugin.findByEntityId(plugin.id)
    expect(foundPlugin.network).to.be.eq(plugin.network)
    expect(foundPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(foundPlugin.address).to.be.eq(plugin.address)
  })

  it('should find by address not supported', async () => {
    const plugin = await Models.Plugin.create({ ...rawPlugin, isSupported: false })
    const foundPlugin = await Models.Plugin.findByAddress(plugin.address, plugin.network)
    expect(foundPlugin.network).to.be.eq(plugin.network)
    expect(foundPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(foundPlugin.address).to.be.eq(plugin.address)
    expect(foundPlugin.isSupported).to.be.false
  })

  it('Should find Plugin by address and networks', async () => {
    const createdPlugin = await Models.Plugin.create(rawPlugin)
    const plugin = await Models.Plugin.findByTokenAddress(
      createdPlugin.tokenAddress,
      createdPlugin.network as NetworksEnum,
    )
    expect(plugin?.address).to.eq(createdPlugin.address)
  })

  it('Should find Plugin by address and networks', async () => {
    const createdPlugin = await Models.Plugin.create(rawPlugin)
    const plugins = await Models.Plugin.findAllByTokenAddress(
      createdPlugin.tokenAddress,
      createdPlugin.network as NetworksEnum,
    )
    expect(plugins[0].address).to.eq(createdPlugin.address)
  })

  it('should find by address isSupported', async () => {
    const rawPlugin2 = {
      ...PluginList[0],
      interfaceType: IPluginInterfaceType.multisig,
      isSupported: true,
    }
    const plugin = await Models.Plugin.create(rawPlugin2)
    const foundPlugin = await Models.Plugin.findByAddress(plugin.address, plugin.network)
    expect(foundPlugin.network).to.be.eq(plugin.network)
    expect(foundPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(foundPlugin.address).to.be.eq(plugin.address)
    expect(foundPlugin.isSupported).to.be.true
  })

  describe('getPluginIdBySlugAndDao', async () => {
    it('should getPluginIdBySlugAndDao', async () => {
      const slug = IPluginSlug.tokenvoting
      const plugin = await Models.Plugin.create(rawPlugin)
      await Models.PluginSlug.create({
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        network: plugin.network,
        slug,
      })

      const pluginId = await Models.Plugin.getPluginIdBySlugAndDao(slug, plugin.daoAddress, plugin.network)
      expect(pluginId).to.eq(plugin.id)
    })

    it('should not find getPluginIdBySlugAndDao', async () => {
      const slug = IPluginSlug.tokenvoting
      const plugin = await Models.Plugin.create(rawPlugin)

      const pluginId = await Models.Plugin.getPluginIdBySlugAndDao(slug, plugin.daoAddress, plugin.network)
      expect(pluginId).to.eq(undefined)
    })
  })

  it('should findActivePluginByTokenAddress', async () => {
    const plugin = await Models.Plugin.create(rawPlugin)
    const foundPlugin = await Models.Plugin.findActivePluginByTokenAddress(plugin.tokenAddress, plugin.network)
    expect(foundPlugin.network).to.be.eq(plugin.network)
    expect(foundPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(foundPlugin.address).to.be.eq(plugin.address)
  })

  it('should update plugin', async () => {
    const plugin = await Models.Plugin.create(rawPlugin)
    const updatedPlugin = await plugin.update({
      id: plugin.id,
      status: 'uninstalled',
    })
    expect(updatedPlugin.status).to.be.eq('uninstalled')
  })

  it('should reload plugin', async () => {
    const plugin = await Models.Plugin.create(rawPlugin)
    const reloadedPlugin = await plugin.reload()
    expect(reloadedPlugin.network).to.be.eq(plugin.network)
    expect(reloadedPlugin.transactionHash).to.be.eq(plugin.transactionHash)
    expect(reloadedPlugin.address).to.be.eq(plugin.address)
  })
})
