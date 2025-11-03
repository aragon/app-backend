import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import AragonReQueueService from '@services/aragon-requeue'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ConfigIndexerHelper from '@src/helpers/configIndexer'
import { IPluginInterfaceType, ITokenType, IPluginStatus } from '@types'

describe('AragonRequeue: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should start and handle mixed plugin and token services', async () => {
    const dbData = [
      // Plugin services
      {
        id: 'ethereum-mainnet-gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        network: 'ethereum-mainnet',
        service: 'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        lastSync: 22082879,
      },
      {
        id: 'polygon-mainnet-tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7',
        network: 'polygon-mainnet',
        service: 'tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7',
        lastSync: 68998403,
      },
      {
        id: 'ethereum-sepolia-tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
        network: 'ethereum-sepolia',
        service: 'tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
        lastSync: 7893826,
      },
      // Token services (new pattern)
      {
        id: 'ethereum-mainnet-ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
        network: 'ethereum-mainnet',
        service: 'ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
        lastSync: 12345678,
      },
      {
        id: 'polygon-mainnet-ERC721-polygon-mainnet-0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
        network: 'polygon-mainnet',
        service: 'ERC721-polygon-mainnet-0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
        lastSync: 87654321,
      },
    ]

    await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

    const dbTokenData = [
      {
        id: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e-ethereum-mainnet',
        network: 'ethereum-mainnet',
        type: 'ERC20',
        address: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
      },
      {
        id: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E-polygon-mainnet',
        network: 'polygon-mainnet',
        type: 'ERC721',
        address: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
      },
    ]

    await Promise.all(dbTokenData.map(async data => Models.Token.create(data)))

    // Mock plugin data for token services
    const mockPluginData = [
      {
        transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        blockNumber: 12345678,
        blockTimestamp: 1234567890,
        address: '0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
        network: 'ethereum-mainnet',
        tokenAddress: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        daoAddress: '0x1111111111111111111111111111111111111111',
      },
      {
        transactionHash: '0x2234567890123456789012345678901234567890123456789012345678901234',
        blockNumber: 12345679,
        blockTimestamp: 1234567891,
        address: '0x703Bf30B62239216E22307a526c4eB148Fddeed8',
        network: 'polygon-mainnet',
        tokenAddress: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
        interfaceType: IPluginInterfaceType.gauge,
        status: IPluginStatus.installed,
        daoAddress: '0x2222222222222222222222222222222222222222',
      },
    ]

    const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
    const loggerInfoStub = sandbox.stub(logger, 'info').resolves()
    await Promise.all(mockPluginData.map(async data => Models.Plugin.create(data)))

    const spyConfigIndexerParse = sandbox.spy(ConfigIndexerHelper.parser, 'parse')
    const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
    const stubFindByTokenAddress = sandbox.stub(Models.Plugin, 'findByTokenAddress')

    // Mock findByTokenAddress to return the plugin for token services
    stubFindByTokenAddress
      .withArgs('0xA5148e8fA0CA950dEaAE6422e32149d361708e2e', 'ethereum-mainnet')
      .resolves(mockPluginData[0])
    stubFindByTokenAddress
      .withArgs('0x1b6ec227ceBeC25118270efbb4b67642fc29965E', 'polygon-mainnet')
      .resolves(mockPluginData[1])

    await AragonReQueueService.start()

    const docs = await Models.ConfigIndexer.find().lean().exec()

    docs.map((doc: any) => {
      expect(doc.id).to.eq(Models.ConfigIndexer.getEntityId({ network: doc.network, service: doc.service }))
    })

    // Should parse all 5 services (3 plugins + 2 tokens)
    expect(spyConfigIndexerParse.callCount).to.equal(5)

    // Should send 5 requeue messages (3 plugins directly + 2 plugins found from tokens)
    expect(stubRabbitMq.callCount).to.equal(5)

    // Verify that all expected addresses were requeued (order may vary)
    const requeuedAddresses = stubRabbitMq.getCalls().map(call => call.args[1].params.address)

    // Should include all 3 plugin addresses
    expect(requeuedAddresses).to.include('0x69E8D5151d71d4cde35b5076aF3023C7D54d379E')
    expect(requeuedAddresses).to.include('0x703Bf30B62239216E22307a526c4eB148Fddeed7')
    expect(requeuedAddresses).to.include('0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1')

    // Should include the 2 plugin addresses found from token services
    expect(requeuedAddresses).to.include('0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7')
    expect(requeuedAddresses).to.include('0x703Bf30B62239216E22307a526c4eB148Fddeed8')
    expect(loggerVerboseStub.called).to.be.eq(true)
    expect(loggerInfoStub.called).to.be.eq(true)
  })

  describe('stop method', () => {
    it('should log stop message', async () => {
      const stubLogInfo = sandbox.stub(logger, 'info')

      await AragonReQueueService.stop()

      expect(stubLogInfo.calledWith('ReQueueService stopped' as any)).to.be.true
    })
  })

  describe('service parsing and requeue logic', () => {
    it('should handle plugin services correctly', async () => {
      const dbData = [
        {
          id: 'ethereum-mainnet-gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
          network: 'ethereum-mainnet',
          service: 'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
          lastSync: 22082879,
        },
      ]

      const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()

      await AragonReQueueService.start()

      expect(loggerVerboseStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true

      expect(stubRabbitMq.callCount).to.equal(1)
      expect(stubRabbitMq.getCall(0).args[1].params.address).to.equal('0x69E8D5151d71d4cde35b5076aF3023C7D54d379E')
    })

    it('should handle token services correctly', async () => {
      const dbData = [
        {
          id: 'ethereum-mainnet-ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          network: 'ethereum-mainnet',
          service: 'ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          lastSync: 12345678,
        },
      ]

      const mockPlugin = {
        transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        blockNumber: 12345678,
        blockTimestamp: 1234567890,
        address: '0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
        network: 'ethereum-mainnet',
        tokenAddress: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        daoAddress: '0x1111111111111111111111111111111111111111',
      }

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))
      await Models.Plugin.create(mockPlugin)
      const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const stubFindByTokenAddress = sandbox.stub(Models.Plugin, 'findByTokenAddress')
      stubFindByTokenAddress
        .withArgs('0xA5148e8fA0CA950dEaAE6422e32149d361708e2e', 'ethereum-mainnet')
        .resolves(mockPlugin)

      await AragonReQueueService.start()
      expect(loggerVerboseStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true
      expect(stubRabbitMq.callCount).to.equal(1)
      expect(stubRabbitMq.getCall(0).args[1].params.address).to.equal('0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7')
    })

    it('should handle multiple plugins for same token', async () => {
      const dbData = [
        {
          id: 'ethereum-mainnet-ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          network: 'ethereum-mainnet',
          service: 'ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          lastSync: 12345678,
        },
      ]

      const mockPlugins = [
        {
          transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
          blockNumber: 12345678,
          blockTimestamp: 1234567890,
          address: '0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
          network: 'ethereum-mainnet',
          tokenAddress: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          daoAddress: '0x1111111111111111111111111111111111111111',
        },
        {
          transactionHash: '0x2234567890123456789012345678901234567890123456789012345678901234',
          blockNumber: 12345679,
          blockTimestamp: 1234567891,
          address: '0x703Bf30B62239216E22307a526c4eB148Fddeed7',
          network: 'ethereum-mainnet',
          tokenAddress: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          interfaceType: IPluginInterfaceType.gauge,
          status: IPluginStatus.installed,
          daoAddress: '0x2222222222222222222222222222222222222222',
        },
      ]

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))
      await Promise.all(mockPlugins.map(async plugin => Models.Plugin.create(plugin)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const stubFindByTokenAddress = sandbox.stub(Models.Plugin, 'findByTokenAddress')
      stubFindByTokenAddress
        .withArgs('0xA5148e8fA0CA950dEaAE6422e32149d361708e2e', 'ethereum-mainnet')
        .resolves(mockPlugins[0])
      const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()

      await AragonReQueueService.start()
      expect(loggerVerboseStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true
      expect(stubRabbitMq.callCount).to.equal(1)
      expect(stubRabbitMq.getCall(0).args[1].params.address).to.equal('0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7')
    })

    it('should skip invalid service patterns', async () => {
      // Use a service that matches the regex but has invalid network
      // This will match the plugin regex pattern but fail parsing due to invalid network
      const dbData = [
        {
          id: 'invalid-service-pattern',
          network: 'ethereum-mainnet',
          service: 'ERC20-ethereum-mainnet-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          lastSync: 12345678,
        },
      ]

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()
      sandbox.stub(ConfigIndexerHelper.parser, 'parse').resolves(null)

      await AragonReQueueService.start()

      expect(stubRabbitMq.callCount).to.equal(0)
      expect(loggerErrorStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true
    })

    it('should handle all supported plugin interface types', async () => {
      const pluginTypes = Object.values(IPluginInterfaceType).filter(type => type !== IPluginInterfaceType.unknown)
      const dbData = pluginTypes.map((pluginType, index) => {
        // Generate a proper 40-character hex address
        const paddedIndex = index.toString().padStart(2, '0')
        const address = `0x${paddedIndex}${'0'.repeat(38)}`
        return {
          id: `ethereum-mainnet-${pluginType}-ethereum-mainnet-${address}`,
          network: 'ethereum-mainnet',
          service: `${pluginType}-ethereum-mainnet-${address}`,
          lastSync: 12345678,
        }
      })

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()
      await AragonReQueueService.start()
      expect(loggerVerboseStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true
      expect(stubRabbitMq.callCount).to.equal(pluginTypes.length)
    })

    it('should handle all supported token types', async () => {
      const tokenTypes = Object.values(ITokenType).filter(
        type => type !== ITokenType.native && type !== ITokenType.unknown,
      )
      const dbData = tokenTypes.map((tokenType, index) => {
        // Generate a proper 40-character hex address
        const paddedIndex = index.toString().padStart(2, '0')
        const tokenAddress = `0x${paddedIndex}${'0'.repeat(38)}`
        return {
          id: `ethereum-mainnet-${tokenType}-ethereum-mainnet-${tokenAddress}`,
          network: 'ethereum-mainnet',
          service: `${tokenType}-ethereum-mainnet-${tokenAddress}`,
          lastSync: 12345678,
        }
      })

      const mockPlugins = tokenTypes.map((tokenType, index) => {
        const paddedIndex = index.toString().padStart(2, '0')
        const tokenAddress = `0x${paddedIndex}${'0'.repeat(38)}`
        const pluginAddress = `0x${(index + 100).toString().padStart(2, '0')}${'0'.repeat(38)}`
        return {
          transactionHash: `0x${index.toString().padStart(64, '0')}`,
          blockNumber: 12345678 + index,
          blockTimestamp: 1234567890 + index,
          address: pluginAddress,
          network: 'ethereum-mainnet',
          tokenAddress: tokenAddress,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          daoAddress: '0x1111111111111111111111111111111111111111',
        }
      })

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))
      await Promise.all(mockPlugins.map(async plugin => Models.Plugin.create(plugin)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const stubFindByTokenAddress = sandbox.stub(Models.Plugin, 'findByTokenAddress')

      tokenTypes.forEach((tokenType, index) => {
        const paddedIndex = index.toString().padStart(2, '0')
        const tokenAddress = `0x${paddedIndex}${'0'.repeat(38)}`
        stubFindByTokenAddress.withArgs(tokenAddress, 'ethereum-mainnet').resolves(mockPlugins[index])
      })

      const loggerVerboseStub = sandbox.stub(logger, 'verbose').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()

      await AragonReQueueService.start()

      expect(stubRabbitMq.callCount).to.equal(tokenTypes.length)
      expect(loggerVerboseStub.called).to.be.true
      expect(loggerInfoStub.called).to.be.true
    })

    it('should handle errors during document processing', async () => {
      const dbData = [
        {
          id: 'ethereum-mainnet-gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
          network: 'ethereum-mainnet',
          service: 'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
          lastSync: 22082879,
        },
      ]

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerInfoStub = sandbox.stub(logger, 'info').resolves()

      // Make RabbitMQ throw an error to trigger the onError callback
      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').rejects(new Error('RabbitMQ error'))

      await AragonReQueueService.start()

      // Verify that the error was logged
      expect(loggerErrorStub.called).to.be.true
      expect(loggerErrorStub.calledWith('Error re-queue' as any)).to.be.true
      expect(loggerInfoStub.called).to.be.true
      expect(stubRabbitMq.callCount).to.equal(1)
    })
  })
})
