import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import QueueAdminController from '@services/aragon-admin-api/controllers/queue'
import { Models } from '@dbModels'
import {
  EnumQueueName,
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  type IQueueDaoTransactions,
  NetworksEnum,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import * as errors from '@errors'
import { ProxyToken } from '@modules/proxyToken'

describe('Controller: QueueAdmin', () => {
  let sandbox: SinonSandbox
  let rabbitMQ: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    rabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('queuePlugins', () => {
    it('should queue plugins successfully', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
      sandbox.stub(Models.Plugin, 'find').resolves([
        {
          address: '0x456',
          network: 'mainnet',
          status: IPluginStatus.installed,
        },
      ])
      sandbox.stub(Models.PluginSlug, 'findOne').resolves(null)
      const stubSlug = sandbox.stub(PluginSlug, 'generateSlug').resolves()

      const result = await QueueAdminController.queuePlugins(params)

      expect(result).to.be.true
      expect(stubSlug.calledOnce).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
    })

    it('should queue plugins successfully when plugin slug exists', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
      sandbox.stub(Models.Plugin, 'find').resolves([
        {
          address: '0x456',
          network: 'mainnet',
          status: IPluginStatus.installed,
        },
      ])
      sandbox.stub(Models.PluginSlug, 'findOne').resolves({ pluginAddress: '0x456', slug: 'existing-slug' })
      const stubSlug = sandbox.stub(PluginSlug, 'generateSlug').resolves()
      const loggerStub = sandbox.stub(logger, 'verbose')

      const result = await QueueAdminController.queuePlugins(params)

      expect(result).to.be.true
      expect(stubSlug.called).to.be.false
      expect(rabbitMQ.calledOnce).to.be.true
      expect(loggerStub.calledWith('Force queue plugin' as any)).to.be.true
    })

    it('should call ProxyToken.saveAndGetToken when plugin has tokenAddress', async () => {
      const daoAddress = '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
      const pluginAddress = '0x1234567890123456789012345678901234567890'
      const tokenAddress = '0xB2f5bC5e7Bb39081811e6a9FE98F6fCa5F5b78a7'
      const network = NetworksEnum.ethereumMainnet

      // Mock the DAO
      const mockDao = { address: daoAddress, network }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      // Mock plugins - one with tokenAddress, one without
      const mockPlugins = [
        {
          address: pluginAddress,
          network,
          tokenAddress, // This plugin has a token
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
          processKey: 'plugin1',
        },
        {
          address: '0x9876543210987654321098765432109876543210',
          network,
          tokenAddress: null, // This plugin doesn't have a token
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
          processKey: 'plugin2',
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      // Mock PluginSlug
      sandbox.stub(Models.PluginSlug, 'findOne').resolves(null)
      const generateSlugStub = sandbox.stub(PluginSlug, 'generateSlug').resolves()

      // Mock RabbitMQ
      const sendMessageStub = rabbitMQ.resolves()

      // Mock ProxyToken.saveAndGetToken
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: tokenAddress,
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
      } as any)

      // Execute the function
      const result = await QueueAdminController.queuePlugins({
        address: daoAddress,
        network,
      })

      // Assertions
      expect(result).to.be.true

      // Verify ProxyToken.saveAndGetToken was called only for the plugin with tokenAddress
      expect(saveAndGetTokenStub.callCount).to.equal(1)
      expect(saveAndGetTokenStub.firstCall.args[0]).to.equal(tokenAddress)
      expect(saveAndGetTokenStub.firstCall.args[1]).to.equal(network)

      // Verify PluginSlug.generateSlug was called for both plugins
      expect(generateSlugStub.callCount).to.equal(2)

      // Verify RabbitMQ messages were sent for both plugins
      expect(sendMessageStub.callCount).to.equal(2)
      expect(sendMessageStub.firstCall.args[0]).to.equal(EnumQueueName.requeue)

      // Check that messages were sent for both plugins (order doesn't matter)
      const sentMessages = sendMessageStub.getCalls().map(call => call.args[1])
      expect(sentMessages).to.have.deep.members([
        { id: pluginAddress, params: { address: pluginAddress, network } },
        {
          id: '0x9876543210987654321098765432109876543210',
          params: { address: '0x9876543210987654321098765432109876543210', network },
        },
      ])
    })

    it('should not call ProxyToken.saveAndGetToken when plugin has no tokenAddress', async () => {
      const daoAddress = '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
      const pluginAddress = '0x1234567890123456789012345678901234567890'
      const network = NetworksEnum.ethereumMainnet

      // Mock the DAO
      const mockDao = { address: daoAddress, network }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      // Mock plugin without tokenAddress
      const mockPlugins = [
        {
          address: pluginAddress,
          network,
          tokenAddress: null, // No token
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
          processKey: 'plugin1',
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      // Mock PluginSlug
      sandbox.stub(Models.PluginSlug, 'findOne').resolves({ pluginAddress, network, slug: 'existing-slug' })

      // Mock RabbitMQ
      const sendMessageStub = rabbitMQ.resolves()

      // Mock ProxyToken.saveAndGetToken
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')

      // Execute the function
      const result = await QueueAdminController.queuePlugins({
        address: daoAddress,
        network,
      })

      // Assertions
      expect(result).to.be.true

      // Verify ProxyToken.saveAndGetToken was NOT called
      expect(saveAndGetTokenStub.callCount).to.equal(0)

      // Verify RabbitMQ message was sent
      expect(sendMessageStub.callCount).to.equal(1)
    })

    it('should handle multiple plugins with mixed tokenAddress presence', async () => {
      const daoAddress = '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
      const network = NetworksEnum.ethereumMainnet
      const tokenAddress1 = '0xAAAA567890123456789012345678901234567890'
      const tokenAddress2 = '0xBBBB567890123456789012345678901234567890'

      // Mock the DAO
      const mockDao = { address: daoAddress, network }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      // Mock plugins with mixed tokenAddress presence
      const mockPlugins = [
        {
          address: '0x1111111111111111111111111111111111111111',
          network,
          tokenAddress: tokenAddress1,
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
        },
        {
          address: '0x2222222222222222222222222222222222222222',
          network,
          tokenAddress: null,
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
        },
        {
          address: '0x3333333333333333333333333333333333333333',
          network,
          tokenAddress: tokenAddress2,
          daoAddress,
          isSupported: true,
          status: IPluginStatus.installed,
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      // Mock PluginSlug
      sandbox.stub(Models.PluginSlug, 'findOne').resolves(null)
      sandbox.stub(PluginSlug, 'generateSlug').resolves()

      // Mock RabbitMQ
      rabbitMQ.resolves()

      // Mock ProxyToken.saveAndGetToken
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({} as any)

      // Execute the function
      await QueueAdminController.queuePlugins({
        address: daoAddress,
        network,
      })

      // Verify ProxyToken.saveAndGetToken was called only for plugins with tokenAddress
      expect(saveAndGetTokenStub.callCount).to.equal(2)
      expect(saveAndGetTokenStub.firstCall.args[0]).to.equal(tokenAddress1)
      expect(saveAndGetTokenStub.secondCall.args[0]).to.equal(tokenAddress2)
    })

    it('should throw error if DAO not found for queuePlugins', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await expect(QueueAdminController.queuePlugins(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should handle empty plugins array', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
      sandbox.stub(Models.Plugin, 'find').resolves([])

      const result = await QueueAdminController.queuePlugins(params)

      expect(result).to.be.true
      expect(rabbitMQ.called).to.be.false
    })

    it('should handle errors when generating slug', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
      sandbox.stub(Models.Plugin, 'find').resolves([
        {
          address: '0x456',
          network: 'mainnet',
          status: IPluginStatus.installed,
        },
      ])
      sandbox.stub(Models.PluginSlug, 'findOne').resolves(null)
      const slugError = new Error('Slug generation failed')
      sandbox.stub(PluginSlug, 'generateSlug').rejects(slugError)

      await expect(QueueAdminController.queuePlugins(params)).to.be.rejectedWith(Error, 'Slug generation failed')
    })

    it('should handle errors when sending message via RabbitMQ', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: 'mainnet' })
      sandbox.stub(Models.Plugin, 'find').resolves([
        {
          address: '0x456',
          network: 'mainnet',
          status: IPluginStatus.installed,
        },
      ])
      sandbox.stub(Models.PluginSlug, 'findOne').resolves({ pluginAddress: '0x456', slug: 'existing-slug' })

      // Restore the original stub and create a new one that rejects
      rabbitMQ.rejects(new Error('RabbitMQ error'))

      await expect(QueueAdminController.queuePlugins(params)).to.be.rejectedWith(Error, 'RabbitMQ error')
    })
  })

  it('should queue proposal metrics successfully', async () => {
    const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
    sandbox.stub(Models.Plugin, 'findOne').resolves({
      address: '0x456',
      network: 'mainnet',
      interfaceType: IPluginInterfaceType.tokenVoting,
      status: IPluginStatus.installed,
    })

    sandbox
      .stub(Models.Proposal, 'findOne')
      .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

    const result = await QueueAdminController.queueProposalMetrics(params)

    expect(result).to.be.true
    expect(rabbitMQ.calledOnce).to.be.true
    expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalTokenVotingMetrics)
  })

  it('should throw error if DAO not found', async () => {
    const params = { address: '0x123', network: 'mainnet' }
    sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

    await expect(QueueAdminController.queueDaoAssets(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
  })

  it('should call rabbitMQ with correct params for queue dao asset', async () => {
    const params = { address: '0x123', network: 'mainnet' }
    sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })
    sandbox.stub(logger, 'verbose')

    const result = await QueueAdminController.queueDaoAssets(params)

    expect(result).to.be.true
    expect(rabbitMQ.calledOnce).to.be.true
    expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.daoAssets)
    expect(rabbitMQ.firstCall.args[1]).to.deep.equal({
      id: '0x123',
      params: { address: '0x123', network: NetworksEnum.ethereumSepolia },
    })
  })

  describe('queueDaoTransactions', () => {
    it('should call rabbitMQ with correct params for queue dao transactions', async () => {
      const params = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumSepolia,
        reset: true,
      } as IQueueDaoTransactions
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })
      sandbox.stub(logger, 'verbose')

      const result = await QueueAdminController.queueDaoTransactions(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.daoTransactions)
      expect(rabbitMQ.firstCall.args[1]).to.deep.equal({
        id: '0x123',
        params: { daoAddress: '0x123', network: NetworksEnum.ethereumSepolia, reset: true },
      })
    })

    it('should throw error if DAO not found', async () => {
      const params = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumSepolia,
        reset: true,
      } as IQueueDaoTransactions
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await expect(QueueAdminController.queueDaoTransactions(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should handle RabbitMQ errors in queueDaoTransactions', async () => {
      const params = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumSepolia,
        reset: true,
      } as IQueueDaoTransactions
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })

      rabbitMQ.rejects(new Error('RabbitMQ error'))

      await expect(QueueAdminController.queueDaoTransactions(params)).to.be.rejectedWith(Error, 'RabbitMQ error')
    })
  })

  describe('queueDaoMetrics', () => {
    it('should call rabbitMQ with correct params for queue dao metrics', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })
      sandbox.stub(logger, 'verbose')

      const result = await QueueAdminController.queueDaoMetrics(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.daoMetrics)
      expect(rabbitMQ.firstCall.args[1]).to.deep.equal({
        id: '0x123',
        params: { address: '0x123', network: NetworksEnum.ethereumSepolia },
      })
    })

    it('should throw error if DAO not found', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await expect(QueueAdminController.queueDaoMetrics(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should handle RabbitMQ errors in queueDaoMetrics', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })

      rabbitMQ.rejects(new Error('RabbitMQ error'))

      await expect(QueueAdminController.queueDaoMetrics(params)).to.be.rejectedWith(Error, 'RabbitMQ error')
    })
  })

  describe('queueProposalMetrics', () => {
    it('should queue proposal metrics for tokenVoting interface type', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
      })

      const loggerStub = sandbox.stub(logger, 'verbose')
      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      const result = await QueueAdminController.queueProposalMetrics(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalTokenVotingMetrics)
    })

    it('should queue proposal metrics for multisig interface type', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
      })
      const loggerStub = sandbox.stub(logger, 'verbose')

      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      const result = await QueueAdminController.queueProposalMetrics(params)
      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalMultisigMetrics)
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should throw error if plugin not found', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await expect(QueueAdminController.queueProposalMetrics(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should throw error if proposal not found', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
      })

      sandbox.stub(Models.Proposal, 'findOne').resolves(null)

      await expect(QueueAdminController.queueProposalMetrics(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should handle RabbitMQ errors in queueProposalMetrics', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
      })

      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      rabbitMQ.rejects(new Error('RabbitMQ error'))

      await expect(QueueAdminController.queueProposalMetrics(params)).to.be.rejectedWith(Error, 'RabbitMQ error')
    })

    it('should properly handle logger verbose calls', async () => {
      const params = { proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' }
      sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
      })

      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      const loggerStub = sandbox.stub(logger, 'verbose')

      await QueueAdminController.queueProposalMetrics(params)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Force queue proposal metrics')
    })
  })

  describe('recalculateProposalActions', () => {
    it('should successfully recalculate proposal actions', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const proposalStub = {
        id: 'proposal123',
        incrementalId: 1,
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x456',
        update: sandbox.stub().resolves(true),
        actions: [1, 2],
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Proposal, 'findByProposalIncrementalId').resolves(proposalStub)

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalActions)
      expect(rabbitMQ.firstCall.args[1]).to.deep.equal({
        id: proposalStub.id,
        params: {
          id: proposalStub.id,
          network: proposalStub.network,
        },
      })
      expect(result.success).to.be.true
      expect(result.message).to.equal('Proposal actions recalculated in the background')
      expect(result.data.proposalId).to.equal('proposal123')
      expect(result.data.actionsCount).to.equal(2)
      expect(proposalStub.update.calledWith({ decoding: true })).to.be.true
    })

    it('should return false when proposal actions parsing fails', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const proposalStub = {
        id: 'proposal123',
        update: sandbox.stub().resolves(true),
      }

      rabbitMQ.rejects(new Error('RabbitMQ error'))

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Proposal, 'findByProposalIncrementalId').resolves(proposalStub)
      sandbox.stub(logger, 'error')

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(result).to.be.false
    })

    it('should return false when plugin is not found', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      // Properly import and stub the errors module
      sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(result).to.be.false
    })

    it('should return false when proposal is not found', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Proposal, 'findByProposalIncrementalId').resolves(null)

      // Properly import and stub the errors module
      sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(result).to.be.false
    })

    it('should handle unexpected errors gracefully', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').throws(new Error('Unexpected error'))
      sandbox.stub(logger, 'error')

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(result).to.be.false
    })

    it('should return actionsCount as 0 when proposal has no actions array', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const proposalStub = {
        id: 'proposal123',
        incrementalId: 1,
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x456',
        update: sandbox.stub().resolves(true),
        actions: null, // No actions array
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Proposal, 'findByProposalIncrementalId').resolves(proposalStub)

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(rabbitMQ.calledOnce).to.be.true
      expect(result.success).to.be.true
      expect(result.data.actionsCount).to.equal(0) // Should be 0 due to || 0 operator
    })

    it('should return actionsCount as 0 when proposal actions array is undefined', async () => {
      const params = {
        incrementalId: 1,
        pluginAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
      }

      const proposalStub = {
        id: 'proposal123',
        incrementalId: 1,
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x456',
        update: sandbox.stub().resolves(true),
        // actions: undefined - not setting it at all
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Proposal, 'findByProposalIncrementalId').resolves(proposalStub)

      const result = await QueueAdminController.recalculateProposalActions(params)

      expect(rabbitMQ.calledOnce).to.be.true
      expect(result.success).to.be.true
      expect(result.data.actionsCount).to.equal(0) // Should be 0 due to || 0 operator
    })
  })
})
