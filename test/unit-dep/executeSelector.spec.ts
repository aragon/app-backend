import sinon from 'sinon'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { NetworksEnum, IPluginStatus } from '@types'
import logger from '@logger'
import configIndexer from '@indexer/configIndexer'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginHandler } from '@handlers/pluginHandler'

describe('ExecuteSelector: Integration Test', () => {
  let sandbox: sinon.SinonSandbox
  const eventsToLook = ['SelectorAllowed', 'SelectorDisallowed', 'EthTransfersAllowed', 'EthTransfersDisallowed']
  const grantedEvent = 'Granted'

  const mockDao = {
    id: 'ethereum-sepolia-0x1234567890123456789012345678901234567890',
    network: NetworksEnum.ethereumSepolia,
    address: '0x1234567890123456789012345678901234567890',
    blockNumber: 12345,
    blockTimestamp: 1234567890,
    transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    creator: '0x1111111111111111111111111111111111111111',
    subdomain: 'test-dao',
    name: 'Test DAO',
    metadata: 'Test metadata',
    isSupported: true,
    version: '1.0.0',
  }

  const mockPlugin = {
    id: 'ethereum-sepolia-0x2222222222222222222222222222222222222222',
    network: NetworksEnum.ethereumSepolia,
    address: '0x2222222222222222222222222222222222222222',
    daoAddress: '0x1234567890123456789012345678901234567890',
    blockNumber: 12346,
    blockTimestamp: 1234567891,
    transactionHash: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc',
    status: IPluginStatus.installed,
    pluginSetupRepoAddress: '0x3333333333333333333333333333333333333333',
    interfaceType: 'admin',
    isSupported: true,
    isProcess: true,
    isBody: true,
    isSubPlugin: false,
    conditionAddress: null as any,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox.restore()
  })

  async function init() {
    await Models.Dao.create(mockDao)
    await Models.Plugin.create(mockPlugin)
  }

  async function parseLogsAndGet(txHash: string, network: NetworksEnum, eventNames: string[]) {
    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)
    if (!receipt) {
      logger.warn('Transaction receipt not found', { txHash, network })
      throw new Error('Transaction receipt not found')
    }

    const topicsToLook = configIndexer.filter(config => eventNames.includes(config.event)).map(config => config.topic)

    const filteredLogs = receipt.logs.filter(log => topicsToLook.includes(log.topics[0]))
    const sortedLogs = filteredLogs.sort((a, b) => a.index - b.index)

    return UnitDepUtils.parseLogsByConfig(sortedLogs, network)
  }

  describe('complete executeSelector flow', () => {
    it('should check if the plugin condition address is set', async () => {
      const txHashes = [
        '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb',
        '0xbf9e3ac7a9aff1248ac333b18035eed748e19f5a8ed86ca5587429cdb545d8d4',
        '0x535989b131da3871381a4c4e80a2155f54e05b6b89daf668f6b9d7d031d8e528',
        '0x9ef64afa23ef2ced4dbfec481c31dd7a17441fc6b6c586d14104a10e59342966',
        '0x72e4d2660cba3b81469672cca40b591af4de64dd2680761b7fc906c121e92f51',
        '0x67a1e915cff251ec247d481a52f5cd373ea755df579734c392052057af52d21f',
        '0xf09bd9546cda4096a58b835e6388c1ec3bc7ddadd84e0112b08dbaf0957d189a',
      ]

      const allEvents = (
        await Promise.all(
          txHashes.map(async txHash => {
            const receipt = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumSepolia)
            if (!receipt) return false
            return await UnitDepUtils.parseLogsByConfig(receipt.logs as any, NetworksEnum.ethereumSepolia)
          }),
        )
      ).filter(Boolean)

      for (const events of allEvents) {
        for (const event of events) {
          await event.handler(event.event, event.info)
        }
      }

      const plugins = await Models.Plugin.find({
        network: NetworksEnum.ethereumSepolia,
      })
      expect(plugins).to.be.an('array')
      const pluginWithCondition = plugins.find(p => p.conditionAddress)
      expect(pluginWithCondition).to.exist
      expect(pluginWithCondition.conditionAddress).to.be.eq('0xDA894f03e043D56022B49D9eef1FD55388cBe55C')
    })
  })

  describe.skip('Complete ExecuteSelector Flow', () => {
    it('should handle complete flow: Grant -> SelectorAllowed -> SelectorDisallowed', async () => {
      await init()

      // Step 1: Grant event - Set condition address
      const grantedTxHash = '0x1111111111111111111111111111111111111111111111111111111111111111'
      const conditionAddress = '0x4444444444444444444444444444444444444444'

      logger.info('Step 1: Processing Grant event to set condition address')

      const grantedParsedLogs = await parseLogsAndGet(grantedTxHash, NetworksEnum.ethereumSepolia, [grantedEvent])
      expect(grantedParsedLogs).to.have.length.greaterThan(0)

      // Process the granted event
      for (const { event, handler, info } of grantedParsedLogs) {
        await handler(event, info)
      }

      // Verify plugin condition address was set
      let plugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(plugin).to.exist
      expect(plugin.conditionAddress).to.not.be.null

      // Update our mock for subsequent tests
      mockPlugin.conditionAddress = plugin.conditionAddress

      logger.info('Step 1 completed: Plugin condition address set', {
        conditionAddress: plugin.conditionAddress,
      })

      // Step 2: SelectorAllowed event - Allow a selector
      const selectorAllowedTxHash = '0x2222222222222222222222222222222222222222222222222222222222222222'
      const allowedSelector = '0x12345678'
      const targetAddress = '0x5555555555555555555555555555555555555555'

      logger.info('Step 2: Processing SelectorAllowed event')

      const selectorAllowedParsedLogs = await parseLogsAndGet(selectorAllowedTxHash, NetworksEnum.ethereumSepolia, [
        'SelectorAllowed',
      ])

      expect(selectorAllowedParsedLogs).to.have.length.greaterThan(0)

      // Process the selector allowed event
      for (const { event, handler, info } of selectorAllowedParsedLogs) {
        await handler(event, info)
      }

      // Verify selector permission was created
      const selectorPermission = await Models.SelectorPermission.findOne({
        network: NetworksEnum.ethereumSepolia,
        transactionHash: selectorAllowedTxHash,
        conditionAddress: plugin.conditionAddress,
        isAllowed: true,
      })

      expect(selectorPermission).to.exist
      expect(selectorPermission.pluginAddress).to.equal(mockPlugin.address)
      expect(selectorPermission.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(selectorPermission.isAllowed).to.be.true
      expect(selectorPermission.selector).to.not.be.null
      expect(selectorPermission.target).to.not.be.null

      logger.info('Step 2 completed: Selector permission created', {
        selector: selectorPermission.selector,
        target: selectorPermission.target,
        isAllowed: selectorPermission.isAllowed,
      })

      // Step 3: SelectorDisallowed event - Disallow the same selector
      const selectorDisallowedTxHash = '0x3333333333333333333333333333333333333333333333333333333333333333'

      logger.info('Step 3: Processing SelectorDisallowed event')

      const selectorDisallowedParsedLogs = await parseLogsAndGet(
        selectorDisallowedTxHash,
        NetworksEnum.ethereumSepolia,
        ['SelectorDisallowed'],
      )

      expect(selectorDisallowedParsedLogs).to.have.length.greaterThan(0)

      // Process the selector disallowed event
      for (const { event, handler, info } of selectorDisallowedParsedLogs) {
        await handler(event, info)
      }

      // Verify selector permission was updated to disallowed
      const updatedSelectorPermission = await Models.SelectorPermission.findOne({
        id: selectorPermission.id,
      })

      expect(updatedSelectorPermission).to.exist
      expect(updatedSelectorPermission.isAllowed).to.be.false
      expect(updatedSelectorPermission.disallowed.status).to.be.true
      expect(updatedSelectorPermission.disallowed.transactionHash).to.equal(selectorDisallowedTxHash)
      expect(updatedSelectorPermission.disallowed.blockNumber).to.not.be.null
      expect(updatedSelectorPermission.disallowed.blockTimestamp).to.not.be.null

      logger.info('Step 3 completed: Selector permission disallowed', {
        selector: updatedSelectorPermission.selector,
        target: updatedSelectorPermission.target,
        isAllowed: updatedSelectorPermission.isAllowed,
        disallowed: updatedSelectorPermission.disallowed,
      })

      // Final verification: Check complete flow
      const finalPlugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      const allSelectorPermissions = await Models.SelectorPermission.find({
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        conditionAddress: finalPlugin.conditionAddress,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(finalPlugin.conditionAddress).to.not.be.null
      expect(allSelectorPermissions).to.have.length(1)
      expect(allSelectorPermissions[0].isAllowed).to.be.false
      expect(allSelectorPermissions[0].disallowed.status).to.be.true

      logger.info('Complete flow verified successfully')
    })

    it('should handle complete flow: Grant -> EthTransfersAllowed -> EthTransfersDisallowed', async () => {
      await init()

      // Step 1: Grant event - Set condition address
      const grantedTxHash = '0x1111111111111111111111111111111111111111111111111111111111111111'

      logger.info('Step 1: Processing Grant event to set condition address for ETH transfers')

      const grantedParsedLogs = await parseLogsAndGet(grantedTxHash, NetworksEnum.ethereumSepolia, [grantedEvent])
      expect(grantedParsedLogs).to.have.length.greaterThan(0)

      for (const { event, handler, info } of grantedParsedLogs) {
        await handler(event, info)
      }

      let plugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(plugin).to.exist
      expect(plugin.conditionAddress).to.not.be.null
      mockPlugin.conditionAddress = plugin.conditionAddress

      logger.info('Step 1 completed: Plugin condition address set for ETH transfers')

      // Step 2: EthTransfersAllowed event
      const ethTransfersAllowedTxHash = '0x4444444444444444444444444444444444444444444444444444444444444444'
      const targetAddress = '0x6666666666666666666666666666666666666666'

      logger.info('Step 2: Processing EthTransfersAllowed event')

      const ethTransfersAllowedParsedLogs = await parseLogsAndGet(
        ethTransfersAllowedTxHash,
        NetworksEnum.ethereumSepolia,
        ['EthTransfersAllowed'],
      )

      expect(ethTransfersAllowedParsedLogs).to.have.length.greaterThan(0)

      for (const { event, handler, info } of ethTransfersAllowedParsedLogs) {
        await handler(event, info)
      }

      const ethTransferPermission = await Models.SelectorPermission.findOne({
        network: NetworksEnum.ethereumSepolia,
        transactionHash: ethTransfersAllowedTxHash,
        conditionAddress: plugin.conditionAddress,
        selector: null, // ETH transfers have null selector
        isAllowed: true,
      })

      expect(ethTransferPermission).to.exist
      expect(ethTransferPermission.pluginAddress).to.equal(mockPlugin.address)
      expect(ethTransferPermission.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(ethTransferPermission.selector).to.be.null
      expect(ethTransferPermission.isAllowed).to.be.true

      logger.info('Step 2 completed: ETH transfer permission created')

      // Step 3: EthTransfersDisallowed event
      const ethTransfersDisallowedTxHash = '0x5555555555555555555555555555555555555555555555555555555555555555'

      logger.info('Step 3: Processing EthTransfersDisallowed event')

      const ethTransfersDisallowedParsedLogs = await parseLogsAndGet(
        ethTransfersDisallowedTxHash,
        NetworksEnum.ethereumSepolia,
        ['EthTransfersDisallowed'],
      )

      expect(ethTransfersDisallowedParsedLogs).to.have.length.greaterThan(0)

      for (const { event, handler, info } of ethTransfersDisallowedParsedLogs) {
        await handler(event, info)
      }

      const updatedEthTransferPermission = await Models.SelectorPermission.findOne({
        id: ethTransferPermission.id,
      })

      expect(updatedEthTransferPermission).to.exist
      expect(updatedEthTransferPermission.isAllowed).to.be.false
      expect(updatedEthTransferPermission.disallowed.status).to.be.true
      expect(updatedEthTransferPermission.disallowed.transactionHash).to.equal(ethTransfersDisallowedTxHash)

      logger.info('Step 3 completed: ETH transfer permission disallowed')

      // Final verification
      const finalPlugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      const allEthTransferPermissions = await Models.SelectorPermission.find({
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        conditionAddress: finalPlugin.conditionAddress,
        selector: null,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(finalPlugin.conditionAddress).to.not.be.null
      expect(allEthTransferPermissions).to.have.length(1)
      expect(allEthTransferPermissions[0].isAllowed).to.be.false
      expect(allEthTransferPermissions[0].disallowed.status).to.be.true

      logger.info('Complete ETH transfer flow verified successfully')
    })

    it('should handle mixed selector and ETH transfer events in sequence', async () => {
      await init()

      // Step 1: Grant event
      const grantedTxHash = '0x1111111111111111111111111111111111111111111111111111111111111111'

      const grantedParsedLogs = await parseLogsAndGet(grantedTxHash, NetworksEnum.ethereumSepolia, [grantedEvent])
      for (const { event, handler, info } of grantedParsedLogs) {
        await handler(event, info)
      }

      const plugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })
      mockPlugin.conditionAddress = plugin.conditionAddress

      // Step 2: Process multiple events in one transaction
      const mixedEventsTxHash = '0x6666666666666666666666666666666666666666666666666666666666666666'

      const mixedParsedLogs = await parseLogsAndGet(mixedEventsTxHash, NetworksEnum.ethereumSepolia, [
        'SelectorAllowed',
        'EthTransfersAllowed',
      ])

      expect(mixedParsedLogs.length).to.be.greaterThan(0)

      for (const { event, handler, info } of mixedParsedLogs) {
        await handler(event, info)
      }

      // Verify both selector and ETH transfer permissions were created
      const allPermissions = await Models.SelectorPermission.find({
        network: NetworksEnum.ethereumSepolia,
        transactionHash: mixedEventsTxHash,
        conditionAddress: plugin.conditionAddress,
      })

      expect(allPermissions.length).to.be.greaterThan(0)

      // Should have both selector permission and ETH transfer permission
      const selectorPermission = allPermissions.find(p => p.selector !== null)
      const ethTransferPermission = allPermissions.find(p => p.selector === null)

      expect(selectorPermission).to.exist
      expect(ethTransferPermission).to.exist

      expect(selectorPermission.isAllowed).to.be.true
      expect(ethTransferPermission.isAllowed).to.be.true

      allPermissions.forEach(permission => {
        expect(permission.pluginAddress).to.equal(mockPlugin.address)
        expect(permission.daoAddress).to.equal(mockPlugin.daoAddress)
        expect(permission.conditionAddress).to.equal(plugin.conditionAddress)
      })

      logger.info('Mixed events flow completed successfully')
    })
  })

  describe.skip('Plugin Condition Address Update', () => {
    it('should update plugin condition address through PluginHandler', async () => {
      await init()

      const newConditionAddress = '0x7777777777777777777777777777777777777777'

      await PluginHandler.updateConditionAddress(
        mockPlugin.address,
        mockPlugin.daoAddress,
        NetworksEnum.ethereumSepolia,
        newConditionAddress,
      )

      const updatedPlugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(updatedPlugin).to.exist
      expect(updatedPlugin.conditionAddress).to.equal(newConditionAddress)
    })

    it('should not update plugin condition address if same value', async () => {
      await init()

      const conditionAddress = '0x8888888888888888888888888888888888888888'

      // First update
      await PluginHandler.updateConditionAddress(
        mockPlugin.address,
        mockPlugin.daoAddress,
        NetworksEnum.ethereumSepolia,
        conditionAddress,
      )

      // Second update with same value - should not change
      await PluginHandler.updateConditionAddress(
        mockPlugin.address,
        mockPlugin.daoAddress,
        NetworksEnum.ethereumSepolia,
        conditionAddress,
      )

      const plugin = await Models.Plugin.findOne({
        address: mockPlugin.address,
        network: NetworksEnum.ethereumSepolia,
      })

      expect(plugin.conditionAddress).to.equal(conditionAddress)
    })
  })
})
