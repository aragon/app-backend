import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'
import { PluginList } from '@test/mock/fakePlugins'
import { IPluginInterfaceType, IPluginSlug, IPluginStatus, NetworksEnum } from '@types'

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
        underlying: '0xUnderlying',
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
      expect(plugin.votingEscrow.underlying).to.equal(rawPlugin?.votingEscrow?.underlying)
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

  it('should find all active plugins for a DAO', async () => {
    const daoAddress = '0x1234567890123456789012345678901234567890'
    const network = NetworksEnum.ethereumMainnet

    const installedPlugin1 = await Models.Plugin.create({
      ...rawPlugin,
      daoAddress,
      network,
      status: IPluginStatus.installed,
      address: '0xPlugin1',
    })

    const installedPlugin2 = await Models.Plugin.create({
      ...rawPlugin,
      daoAddress,
      network,
      status: IPluginStatus.installed,
      address: '0xPlugin2',
      transactionHash: '0xDifferentTxHash2',
    })

    // Create an uninstalled plugin (should not be returned)
    await Models.Plugin.create({
      ...rawPlugin,
      daoAddress,
      network,
      status: IPluginStatus.uninstalled,
      address: '0xPlugin3',
      transactionHash: '0xDifferentTxHash3',
    })

    // Create a plugin for different DAO (should not be returned)
    await Models.Plugin.create({
      ...rawPlugin,
      daoAddress: '0xDifferentDao',
      network,
      status: IPluginStatus.installed,
      address: '0xPlugin4',
      transactionHash: '0xDifferentTxHash4',
    })

    // Create a plugin for different network (should not be returned)
    await Models.Plugin.create({
      ...rawPlugin,
      daoAddress,
      network: NetworksEnum.ethereumSepolia,
      status: IPluginStatus.installed,
      address: '0xPlugin5',
      transactionHash: '0xDifferentTxHash5',
    })

    // Call the method
    const activePlugins = await Models.Plugin.findActivePluginsByDaoAddress(daoAddress, network)

    // Verify results
    expect(activePlugins).to.have.lengthOf(2)
    expect(activePlugins.map(p => p.address)).to.include.members(['0xPlugin1', '0xPlugin2'])
    expect(activePlugins.every(p => p.status === IPluginStatus.installed)).to.be.true
    expect(activePlugins.every(p => p.daoAddress === daoAddress)).to.be.true
    expect(activePlugins.every(p => p.network === network)).to.be.true
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
