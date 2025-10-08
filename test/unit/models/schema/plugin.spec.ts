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

  describe('findByDaoWithFilters', () => {
    const daoAddress = '0x1234567890123456789012345678901234567890'
    const network = NetworksEnum.ethereumMainnet

    beforeEach(async () => {
      // Create test plugins with various combinations of properties
      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.tokenVoting,
        isProcess: false,
        isSupported: true,
        address: '0xPlugin1',
        transactionHash: '0xHash1',
      })

      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.uninstalled,
        interfaceType: IPluginInterfaceType.multisig,
        isProcess: true,
        isSupported: true,
        address: '0xPlugin2',
        transactionHash: '0xHash2',
      })

      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.admin,
        isProcess: false,
        isSupported: false,
        address: '0xPlugin3',
        transactionHash: '0xHash3',
      })

      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.preInstall,
        interfaceType: IPluginInterfaceType.tokenVoting,
        isProcess: true,
        isSupported: true,
        address: '0xPlugin4',
        transactionHash: '0xHash4',
      })

      // Plugin for different DAO (should not be returned)
      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress: '0xDifferentDao',
        network,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.tokenVoting,
        isProcess: false,
        isSupported: true,
        address: '0xPlugin5',
        transactionHash: '0xHash5',
      })

      // Plugin for different network (should not be returned)
      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network: NetworksEnum.polygonMainnet,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.tokenVoting,
        isProcess: false,
        isSupported: true,
        address: '0xPlugin6',
        transactionHash: '0xHash6',
      })
    })

    it('should return all plugins for DAO when status is not provided', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
      })

      expect(plugins).to.have.lengthOf(4)
      expect(plugins.every(p => p.daoAddress === daoAddress)).to.be.true
      expect(plugins.every(p => p.network === network)).to.be.true
    })

    it('should filter by status when status is provided', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        status: IPluginStatus.installed,
      })

      expect(plugins).to.have.lengthOf(2)
      expect(plugins.every(p => p.status === IPluginStatus.installed)).to.be.true
      expect(plugins.map(p => p.address)).to.include.members(['0xPlugin1', '0xPlugin3'])
    })

    it('should filter by interfaceType', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })

      expect(plugins).to.have.lengthOf(2)
      expect(plugins.every(p => p.interfaceType === IPluginInterfaceType.tokenVoting)).to.be.true
      expect(plugins.map(p => p.address)).to.include.members(['0xPlugin1', '0xPlugin4'])
    })

    it('should filter by isProcess=true', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isProcess: true,
      })

      expect(plugins).to.have.lengthOf(2)
      expect(plugins.every(p => p.isProcess === true)).to.be.true
      expect(plugins.map(p => p.address)).to.include.members(['0xPlugin2', '0xPlugin4'])
    })

    it('should filter by isProcess=false', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isProcess: false,
      })

      expect(plugins).to.have.lengthOf(2)
      expect(plugins.every(p => p.isProcess === false)).to.be.true
      expect(plugins.map(p => p.address)).to.include.members(['0xPlugin1', '0xPlugin3'])
    })

    it('should filter by isSupported=true', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isSupported: true,
      })

      expect(plugins).to.have.lengthOf(3)
      expect(plugins.every(p => p.isSupported === true)).to.be.true
      expect(plugins.map(p => p.address)).to.include.members(['0xPlugin1', '0xPlugin2', '0xPlugin4'])
    })

    it('should filter by isSupported=false', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isSupported: false,
      })

      expect(plugins).to.have.lengthOf(1)
      expect(plugins[0].isSupported).to.be.false
      expect(plugins[0].address).to.equal('0xPlugin3')
    })

    it('should combine multiple filters: status + interfaceType', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })

      expect(plugins).to.have.lengthOf(1)
      expect(plugins[0].status).to.equal(IPluginStatus.installed)
      expect(plugins[0].interfaceType).to.equal(IPluginInterfaceType.tokenVoting)
      expect(plugins[0].address).to.equal('0xPlugin1')
    })

    it('should combine multiple filters: interfaceType + isProcess + isSupported', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        isProcess: true,
        isSupported: true,
      })

      expect(plugins).to.have.lengthOf(1)
      expect(plugins[0].interfaceType).to.equal(IPluginInterfaceType.tokenVoting)
      expect(plugins[0].isProcess).to.be.true
      expect(plugins[0].isSupported).to.be.true
      expect(plugins[0].address).to.equal('0xPlugin4')
    })

    it('should combine all filters', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.admin,
        isProcess: false,
        isSupported: false,
      })

      expect(plugins).to.have.lengthOf(1)
      expect(plugins[0].status).to.equal(IPluginStatus.installed)
      expect(plugins[0].interfaceType).to.equal(IPluginInterfaceType.admin)
      expect(plugins[0].isProcess).to.be.false
      expect(plugins[0].isSupported).to.be.false
      expect(plugins[0].address).to.equal('0xPlugin3')
    })

    it('should return empty array when no plugins match filters', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        status: IPluginStatus.deprecated,
      })

      expect(plugins).to.be.an('array')
      expect(plugins).to.have.lengthOf(0)
    })

    it('should return plugins sorted by blockNumber descending', async () => {
      // Create plugins with different block numbers
      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.installed,
        address: '0xPlugin7',
        transactionHash: '0xHash7',
        blockNumber: 1000,
      })

      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.installed,
        address: '0xPlugin8',
        transactionHash: '0xHash8',
        blockNumber: 2000,
      })

      await Models.Plugin.create({
        ...rawPlugin,
        daoAddress,
        network,
        status: IPluginStatus.installed,
        address: '0xPlugin9',
        transactionHash: '0xHash9',
        blockNumber: 1500,
      })

      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        status: IPluginStatus.installed,
      })

      // Should be sorted by blockNumber descending
      // Filter to only the plugins we just created to test sorting
      const testPlugins = plugins.filter(p => ['0xPlugin7', '0xPlugin8', '0xPlugin9'].includes(p.address))
      expect(testPlugins).to.have.lengthOf(3)
      expect(testPlugins[0].blockNumber).to.equal(2000)
      expect(testPlugins[1].blockNumber).to.equal(1500)
      expect(testPlugins[2].blockNumber).to.equal(1000)
    })

    it('should not include isProcess filter when undefined', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isProcess: undefined,
      })

      // Should return all plugins regardless of isProcess value
      expect(plugins).to.have.lengthOf(4)
      expect(plugins.some(p => p.isProcess === true)).to.be.true
      expect(plugins.some(p => p.isProcess === false)).to.be.true
    })

    it('should not include isSupported filter when undefined', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
        isSupported: undefined,
      })

      // Should return all plugins regardless of isSupported value
      expect(plugins).to.have.lengthOf(4)
      expect(plugins.some(p => p.isSupported === true)).to.be.true
      expect(plugins.some(p => p.isSupported === false)).to.be.true
    })

    it('should return lean documents (plain objects)', async () => {
      const plugins = await Models.Plugin.findByDaoWithFilters({
        daoAddress,
        network,
      })

      // Lean documents should not have mongoose methods
      expect(plugins[0].save).to.be.undefined
      expect(plugins[0].update).to.be.undefined
      // But should have data properties
      expect(plugins[0]).to.have.property('address')
      expect(plugins[0]).to.have.property('network')
    })
  })
})
