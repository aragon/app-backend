import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import AragonReQueueService from '@services/aragon-requeue'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ConfigIndexerHelper from '@src/helpers/configIndexer'
import { IPluginInterfaceType, ITokenType, IPluginStatus, EnumQueueName } from '@types'
import utils from '@helpers/utils'

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
  })

  describe('DAO deposit/withdraw config requeue', () => {
    beforeEach(async () => {
      // Ensure database is clean before each test
      await Models.Dao.deleteMany({})
      await Models.ConfigIndexer.deleteMany({})
    })

    it('should push DAOs without deposit/withdraw configs to daoTransactions queue using aggregation', async () => {
      // Prepopulate the database with DAOs
      const daoData = [
        {
          id: 'dao1-ethereum-mainnet',
          address: '0xDao1111111111111111111111111111111111111',
          creatorAddress: utils.zeroAddress,
          network: 'ethereum-mainnet',
          blockNumber: 12345678,
          blockTimestamp: 1234567890,
        },
        {
          id: 'dao2-ethereum-mainnet',
          address: '0xDao2222222222222222222222222222222222222',
          creatorAddress: utils.zeroAddress,
          network: 'ethereum-mainnet',
          blockNumber: 12345679,
          blockTimestamp: 1234567891,
        },
        {
          id: 'dao3-polygon-mainnet',
          address: '0xDao3333333333333333333333333333333333333',
          creatorAddress: utils.zeroAddress,
          network: 'polygon-mainnet',
          blockNumber: 12345680,
          blockTimestamp: 1234567892,
        },
      ]

      await Promise.all(daoData.map(async (data: any) => Models.Dao.create(data)))

      // Prepopulate ConfigIndexer
      // DAO1: has 3 configs (missing nativeWithdraw)
      const dao1Configs = [
        {
          id: 'nativeDeposit-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'nativeDeposit-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          lastSync: 12345678,
          end: false,
        },
        {
          id: 'tokenDeposit-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'tokenDeposit-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          lastSync: 12345678,
          end: false,
        },
        {
          id: 'tokenWithdraw-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'tokenWithdraw-ethereum-mainnet-0xDao1111111111111111111111111111111111111',
          lastSync: 12345678,
          end: false,
        },
      ]

      // DAO2: has all 4 configs (should NOT be queued)
      const dao2Configs = [
        {
          id: 'nativeDeposit-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'nativeDeposit-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          lastSync: 12345679,
          end: false,
        },
        {
          id: 'nativeWithdraw-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'nativeWithdraw-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          lastSync: 12345679,
          end: false,
        },
        {
          id: 'tokenDeposit-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'tokenDeposit-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          lastSync: 12345679,
          end: false,
        },
        {
          id: 'tokenWithdraw-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'tokenWithdraw-ethereum-mainnet-0xDao2222222222222222222222222222222222222',
          lastSync: 12345679,
          end: false,
        },
      ]

      // DAO3: has no configs (should be queued with 4 missing configs)
      // No configs created for DAO3

      await Promise.all([...dao1Configs, ...dao2Configs].map(async data => Models.ConfigIndexer.create(data)))

      // Stub RabbitMQ
      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      // Run the service
      await AragonReQueueService.start()

      // Verify that only DAOs with missing configs were queued
      const daoTransactionsCalls = stubRabbitMq
        .getCalls()
        .filter(call => call.args[0] === EnumQueueName.daoTransactions)

      // Should have 2 calls: DAO1 (missing 1 config) and DAO3 (missing all 4 configs)
      expect(daoTransactionsCalls.length).to.equal(2)

      const queuedDaos = daoTransactionsCalls.map(call => ({
        address: call.args[1].params.daoAddress,
        network: call.args[1].params.network,
      }))

      // Check that the correct DAOs were queued
      const dao1Queued = queuedDaos.find(d => d.address === '0xDao1111111111111111111111111111111111111')
      const dao3Queued = queuedDaos.find(d => d.address === '0xDao3333333333333333333333333333333333333')

      expect(dao1Queued).to.exist
      expect(dao1Queued?.network).to.equal('ethereum-mainnet')

      expect(dao3Queued).to.exist
      expect(dao3Queued?.network).to.equal('polygon-mainnet')

      // DAO2 should NOT be queued
      const dao2Queued = queuedDaos.find(d => d.address === '0xDao2222222222222222222222222222222222222')
      expect(dao2Queued).to.not.exist

      // Verify logging
      expect(loggerInfoStub.calledWith('Looking for DAOs without deposit/withdraw config' as any)).to.be.true

      // Verify that verbose logging includes missing configs information
      const verboseCalls = loggerVerboseStub.getCalls()
      const daoLogCalls = verboseCalls.filter(
        (call: any) =>
          typeof call.args[0] === 'string' && call.args[0].includes('Pushing DAO to daoTransactions queue'),
      )

      // Should have logged for 2 DAOs
      expect(daoLogCalls.length).to.equal(2)
    })

    it('should handle DAOs with ended configs correctly', async () => {
      // Create a DAO
      const daoData = {
        id: 'dao-ethereum-mainnet',
        address: '0xDao4444444444444444444444444444444444444',
        network: 'ethereum-mainnet',
        creatorAddress: utils.zeroAddress,
        blockNumber: 12345678,
        blockTimestamp: 1234567890,
      }

      await Models.Dao.create(daoData)

      // Create configs with end flag set to true (should be treated as missing)
      const endedConfigs = [
        {
          id: 'nativeDeposit-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          network: 'ethereum-mainnet',
          service: 'nativeDeposit-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          lastSync: 12345678,
          end: true, // This config is ended
        },
        {
          id: 'nativeWithdraw-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          network: 'ethereum-mainnet',
          service: 'nativeWithdraw-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          lastSync: 12345678,
          end: true, // This config is ended
        },
        {
          id: 'tokenDeposit-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          network: 'ethereum-mainnet',
          service: 'tokenDeposit-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          lastSync: 12345678,
          end: false, // This one is active
        },
        {
          id: 'tokenWithdraw-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          network: 'ethereum-mainnet',
          service: 'tokenWithdraw-ethereum-mainnet-0xDao4444444444444444444444444444444444444',
          lastSync: 12345678,
          // end field doesn't exist (treated as active)
        },
      ]

      await Promise.all(endedConfigs.map(async data => Models.ConfigIndexer.create(data)))

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      sandbox.stub(logger, 'verbose').resolves()
      sandbox.stub(logger, 'info').resolves()

      await AragonReQueueService.start()

      // Should requeue the DAO since only 2 out of 4 configs are active
      const daoTransactionsCalls = stubRabbitMq
        .getCalls()
        .filter(call => call.args[0] === EnumQueueName.daoTransactions)

      expect(daoTransactionsCalls.length).to.equal(1)
      expect(daoTransactionsCalls[0].args[1].params.daoAddress).to.equal('0xDao4444444444444444444444444444444444444')
    })

    it('should verify aggregation pipeline returns correct missing configs information', async () => {
      // Create DAOs with various config states
      const daoData = [
        {
          id: 'dao-complete-ethereum-mainnet',
          address: '0xDaoComplete11111111111111111111111111111',
          network: 'ethereum-mainnet',
          creatorAddress: utils.zeroAddress,
          blockNumber: 10000000,
          blockTimestamp: 1234567890,
        },
        {
          id: 'dao-partial-ethereum-mainnet',
          address: '0xDaoPartial22222222222222222222222222222',
          network: 'ethereum-mainnet',
          creatorAddress: utils.zeroAddress,
          blockNumber: 10000001,
          blockTimestamp: 1234567891,
        },
        {
          id: 'dao-none-ethereum-mainnet',
          address: '0xDaoNone33333333333333333333333333333333',
          network: 'ethereum-mainnet',
          creatorAddress: utils.zeroAddress,
          blockNumber: 10000002,
          blockTimestamp: 1234567892,
        },
      ]

      await Promise.all(daoData.map(async (data: any) => Models.Dao.create(data)))

      // Complete DAO: all 4 configs (should NOT appear in results)
      const completeConfigs = [
        {
          id: 'nativeDeposit-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'nativeDeposit-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          lastSync: 10000000,
          end: false,
        },
        {
          id: 'nativeWithdraw-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'nativeWithdraw-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          lastSync: 10000000,
        },
        {
          id: 'tokenDeposit-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'tokenDeposit-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          lastSync: 10000000,
          end: false,
        },
        {
          id: 'tokenWithdraw-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          network: 'ethereum-mainnet',
          service: 'tokenWithdraw-ethereum-mainnet-0xDaoComplete11111111111111111111111111111',
          lastSync: 10000000,
        },
      ]

      // Partial DAO: only has 2 configs
      const partialConfigs = [
        {
          id: 'nativeDeposit-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'nativeDeposit-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
          lastSync: 10000001,
        },
        {
          id: 'tokenDeposit-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
          network: 'ethereum-mainnet',
          service: 'tokenDeposit-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
          lastSync: 10000001,
          end: false,
        },
      ]

      // None DAO: no configs at all

      await Promise.all([...completeConfigs, ...partialConfigs].map(async data => Models.ConfigIndexer.create(data)))

      // Stub RabbitMQ
      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      // Run the service
      await AragonReQueueService.start()

      // Get all daoTransactions queue calls
      const daoTransactionsCalls = stubRabbitMq
        .getCalls()
        .filter(call => call.args[0] === EnumQueueName.daoTransactions)

      // Should only queue 2 DAOs (partial and none)
      expect(daoTransactionsCalls.length).to.equal(2)

      // Verify the aggregation returned correct data
      const queuedAddresses = daoTransactionsCalls.map(call => call.args[1].params.daoAddress)

      // Complete DAO should NOT be queued
      expect(queuedAddresses).to.not.include('0xDaoComplete11111111111111111111111111111')

      // Partial and None DAOs should be queued
      expect(queuedAddresses).to.include('0xDaoPartial22222222222222222222222222222')
      expect(queuedAddresses).to.include('0xDaoNone33333333333333333333333333333333')

      // Verify that the logging includes missing configs information
      const verboseLogs = loggerVerboseStub
        .getCalls()
        .filter(
          (call: any) =>
            typeof call.args[0] === 'string' && call.args[0].includes('Pushing DAO to daoTransactions queue'),
        )

      expect(verboseLogs.length).to.equal(2)

      // Check that the logs include missingConfigsCount field
      verboseLogs.forEach((call: any) => {
        const logData = call.args[1] as any
        if (logData) {
          expect(logData).to.have.property('missingConfigsCount')
          expect(logData).to.have.property('missingConfigs')

          // Verify the missingConfigs array contains the expected service names
          if (logData.daoAddress === '0xDaoPartial22222222222222222222222222222') {
            expect(logData.missingConfigsCount).to.equal(2) // Missing nativeWithdraw and tokenWithdraw
            expect(logData.missingConfigs).to.include(
              'nativeWithdraw-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
            )
            expect(logData.missingConfigs).to.include(
              'tokenWithdraw-ethereum-mainnet-0xDaoPartial22222222222222222222222222222',
            )
          } else if (logData.daoAddress === '0xDaoNone33333333333333333333333333333333') {
            expect(logData.missingConfigsCount).to.equal(4) // Missing all 4 configs
          }
        }
      })
    })

    it('should correctly handle pagination in aggregation', async () => {
      // Create multiple DAOs without configs to test pagination
      const daoData: any[] = []
      for (let i = 1; i <= 5; i++) {
        daoData.push({
          id: `dao-${i}-ethereum-mainnet`,
          address: `0xDao${i.toString().padStart(40, '0')}`,
          network: 'ethereum-mainnet',
          creatorAddress: utils.zeroAddress,
          blockNumber: 10000000 + i,
          blockTimestamp: 1234567890 + i,
        })
      }

      await Promise.all(daoData.map(async (data: any) => Models.Dao.create(data)))

      // No configs created, so all DAOs should be queued

      const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      // Run the service
      await AragonReQueueService.start()

      // Verify all 5 DAOs were queued
      const daoTransactionsCalls = stubRabbitMq
        .getCalls()
        .filter(call => call.args[0] === EnumQueueName.daoTransactions)

      expect(daoTransactionsCalls.length).to.equal(5)

      // Verify they all have the correct structure
      daoTransactionsCalls.forEach(call => {
        expect(call.args[1]).to.have.property('id')
        expect(call.args[1]).to.have.property('params')
        expect(call.args[1].params).to.have.property('daoAddress')
        expect(call.args[1].params).to.have.property('network')
        expect(call.args[1].params.network).to.equal('ethereum-mainnet')
      })
    })
  })
})
