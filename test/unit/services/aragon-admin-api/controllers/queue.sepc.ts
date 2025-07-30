import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import QueueAdminController from '@services/aragon-admin-api/controllers/queue'
import { Models } from '@dbModels'
import { EnumQueueName, ErrorKeyEnum, IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import * as errors from '@errors'

describe.only('Controller: QueueAdmin', () => {
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
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })
      sandbox.stub(logger, 'verbose')

      const result = await QueueAdminController.queueDaoTransactions(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.daoTransactions)
      expect(rabbitMQ.firstCall.args[1]).to.deep.equal({
        id: '0x123',
        params: { address: '0x123', network: NetworksEnum.ethereumSepolia },
      })
    })

    it('should throw error if DAO not found', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await expect(QueueAdminController.queueDaoTransactions(params)).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
    })

    it('should handle RabbitMQ errors in queueDaoTransactions', async () => {
      const params = { address: '0x123', network: 'mainnet' }
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x123', network: NetworksEnum.ethereumSepolia })

      // Restore the original stub and create a new one that rejects
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

      // Restore the original stub and create a new one that rejects
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

      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      const result = await QueueAdminController.queueProposalMetrics(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
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

      sandbox
        .stub(Models.Proposal, 'findOne')
        .resolves({ proposalIndex: '1', pluginAddress: '0x456', network: 'mainnet' })

      const result = await QueueAdminController.queueProposalMetrics(params)

      expect(result).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.proposalMultisigMetrics)
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

      // Restore the original stub and create a new one that rejects
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
      sandbox.stub(logger, 'info')

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
  })

  describe('resetAndForceSyncToken', () => {
    it('should successfully reset and force sync plugin token', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x456', // Same as params.address since we're syncing a token
      }
      const configIndexerStub = {
        service: 'tokenVoting-mainnet-0x456-0x456',
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub]) // find returns array of plugins with this token
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(configIndexerStub)
      const memberTransactionStub = sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      const memberBalanceStub = sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      const daoMemberMappingStub = sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves()
      const memberMetricsStub = sandbox.stub(Models.MemberMetrics, 'deleteMany').resolves()

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)

      const result = await QueueAdminController.resetAndForceSyncToken(params)

      expect(result).to.be.undefined
      expect(memberTransactionStub.calledOnce).to.be.true
      expect(memberTransactionStub.firstCall.args[0]).to.deep.equal({
        tokenAddress: '0x456',
        network: 'mainnet'
      })
      expect(memberBalanceStub.calledOnce).to.be.true
      expect(memberBalanceStub.firstCall.args[0]).to.deep.equal({
        tokenAddress: '0x456',
        network: 'mainnet'
      })
      expect(daoMemberMappingStub.calledOnce).to.be.true
      expect(daoMemberMappingStub.firstCall.args[0]).to.deep.equal({
        pluginAddress: '0x456',
        tokenAddress: '0x456',
        network: 'mainnet',
      })
      expect(memberMetricsStub.calledOnce).to.be.true
      expect(memberMetricsStub.firstCall.args[0]).to.deep.equal({
        pluginAddress: '0x456',
        network: 'mainnet',
      })
      expect(configIndexerStub.deleteOne.calledOnce).to.be.true
      expect(tokenStub.deleteOne.calledOnce).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
      expect(rabbitMQ.firstCall.args).to.deep.equal([
        EnumQueueName.plugins,
        {
          id: '0x456',
          params: { address: '0x456', network: 'mainnet' },
        }
      ])
    })

    it('should return early if token not found', async () => {
      const params = { address: '0x456', network: 'mainnet' }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)
      const pluginFindStub = sandbox.stub(Models.Plugin, 'find')
      const memberTransactionStub = sandbox.stub(Models.MemberTransaction, 'deleteMany')

      const result = await QueueAdminController.resetAndForceSyncToken(params)

      expect(result).to.be.undefined
      expect(pluginFindStub.called).to.be.false
      expect(memberTransactionStub.called).to.be.false
    })

    it('should handle empty plugins array', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x456',
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([]) // No plugins found
      const memberTransactionStub = sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      const memberBalanceStub = sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      const configIndexerStub = sandbox.stub(Models.ConfigIndexer, 'findOne')

      const result = await QueueAdminController.resetAndForceSyncToken(params)

      expect(result).to.be.undefined
      expect(memberTransactionStub.calledOnce).to.be.true
      expect(memberBalanceStub.calledOnce).to.be.true
      expect(configIndexerStub.called).to.be.false // No plugins, so no config indexer calls
      expect(tokenStub.deleteOne.calledOnce).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
    })

    it('should log error and continue if no config indexer found', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x456',
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub])
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')
      const memberTransactionStub = sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      const memberBalanceStub = sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      const daoMemberMappingStub = sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves()
      const memberMetricsStub = sandbox.stub(Models.MemberMetrics, 'deleteMany').resolves()

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)

      const result = await QueueAdminController.resetAndForceSyncToken(params)

      expect(result).to.be.undefined
      expect(loggerStub.calledOnce).to.be.true
      const args = loggerStub.firstCall.args as any
      expect(args[0]).to.equal('No config indexer found')
      expect(args[1]).to.include({
        params,
        service: 'tokenVoting-mainnet-0x456-0x456',
      })
      // Still deletes member data and continues
      expect(memberTransactionStub.calledOnce).to.be.true
      expect(memberBalanceStub.calledOnce).to.be.true
      expect(daoMemberMappingStub.notCalled).to.be.true
      expect(memberMetricsStub.notCalled).to.be.true
      expect(tokenStub.deleteOne.calledOnce).to.be.true
      expect(rabbitMQ.calledOnce).to.be.true
    })

    it('should handle errors when deleting member transactions', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.multisig,
        tokenAddress: '0x456',
      }
      const configIndexerStub = {
        service: 'multisig-mainnet-0x456-0x456',
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub])
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(configIndexerStub)
      sandbox.stub(Models.MemberTransaction, 'deleteMany').rejects(new Error('Delete failed'))
      sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves()
      sandbox.stub(Models.MemberMetrics, 'deleteMany').resolves()

      await expect(QueueAdminController.resetAndForceSyncToken(params)).to.be.rejectedWith(Error, 'Delete failed')
    })

    it('should handle errors when deleting config indexer', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x456',
      }
      const configIndexerStub = {
        service: 'tokenVoting-mainnet-0x456-0x456',
        deleteOne: sandbox.stub().rejects(new Error('ConfigIndexer delete failed')),
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub])
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(configIndexerStub)
      sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves()
      sandbox.stub(Models.MemberMetrics, 'deleteMany').resolves()

      await expect(QueueAdminController.resetAndForceSyncToken(params)).to.be.rejectedWith(
        Error,
        'ConfigIndexer delete failed',
      )
    })

    it('should construct correct service string for different interface types', async () => {
      const params = { address: '0x789', network: 'sepolia' }
      const tokenStub = {
        address: '0x789',
        network: 'sepolia',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0xABC',
        network: 'sepolia',
        interfaceType: IPluginInterfaceType.multisig,
        tokenAddress: '0x789',
      }
      const configIndexerStub = {
        service: 'multisig-sepolia-0xABC-0x789',
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub])
      const configIndexerFindStub = sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(configIndexerStub)
      sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves()
      sandbox.stub(Models.MemberMetrics, 'deleteMany').resolves()
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)

      await QueueAdminController.resetAndForceSyncToken(params)

      expect(configIndexerFindStub.calledOnce).to.be.true
      expect(configIndexerFindStub.firstCall.args[0]).to.deep.equal({
        service: 'multisig-sepolia-0xABC-0x789',
      })
    })

    it('should handle plugin with undefined tokenAddress', async () => {
      const params = { address: '0x456', network: 'mainnet' }
      const tokenStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: 'mainnet',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: undefined,
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'find').resolves([]) // No plugins with this token
      const configIndexerStub = sandbox.stub(Models.ConfigIndexer, 'findOne')
      const memberTransactionStub = sandbox.stub(Models.MemberTransaction, 'deleteMany').resolves()
      const memberBalanceStub = sandbox.stub(Models.MemberBalance, 'deleteMany').resolves()
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)

      const result = await QueueAdminController.resetAndForceSyncToken(params)

      expect(result).to.be.undefined
      expect(configIndexerStub.called).to.be.false
      expect(memberTransactionStub.calledOnce).to.be.true
      expect(memberBalanceStub.calledOnce).to.be.true
    })

    it('should wait for all delete operations to complete', async () => {
      const params = { address: '0x456', network: NetworksEnum.ethereumSepolia }
      const tokenStub = {
        address: '0x456',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: ITokenType.ERC20,
        deleteOne: sandbox.stub().resolves(),
      }
      const pluginStub = {
        address: '0x456',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x456',
      }
      const configIndexerStub = {
        service: 'tokenVoting-ethereum-sepolia-0x456-0x456',
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(tokenStub)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(pluginStub)
      sandbox.stub(Models.Plugin, 'find').resolves([pluginStub])
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves(configIndexerStub)

      // Create stubs with delays to test Promise.all behavior
      const memberTransactionStub = sandbox
        .stub(Models.MemberTransaction, 'deleteMany')
        .returns(new Promise(resolve => setTimeout(() => resolve({}), 10)))
      const memberBalanceStub = sandbox
        .stub(Models.MemberBalance, 'deleteMany')
        .returns(new Promise(resolve => setTimeout(() => resolve({}), 20)))
      const daoMemberMappingStub = sandbox
        .stub(Models.DaoMemberMapping, 'deleteMany')
        .returns(new Promise(resolve => setTimeout(() => resolve({}), 30)))
      const daoMemberMetricsStub = sandbox
        .stub(Models.MemberMetrics, 'deleteMany')
        .returns(new Promise(resolve => setTimeout(() => resolve({}), 30)))

      await QueueAdminController.resetAndForceSyncToken(params)

      expect(memberTransactionStub.calledOnce).to.be.true
      expect(memberBalanceStub.calledOnce).to.be.true
      expect(daoMemberMappingStub.calledOnce).to.be.true
      expect(daoMemberMetricsStub.calledOnce).to.be.true
      expect(configIndexerStub.deleteOne.calledOnce).to.be.true
      expect(tokenStub.deleteOne.calledOnce).to.be.true
    })
  })
})
