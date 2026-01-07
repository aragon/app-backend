import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { LogAdmin } from '@plugins/logAdmin'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'
import { LogDao } from '@plugins/logDao'
import { LogGauge } from '@plugins/logGauge'
import { LogMultiSig } from '@plugins/logMultisig'
import { LogSelectorPermission } from '@plugins/logSelectorPermission'
import { LogSpp } from '@plugins/logSPP'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@services/aragon-plugins/index'
import { EnumQueueName, IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should process the logDao queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({} as any)
      const logDaoStub = sandbox.stub(LogDao, 'start').resolves()

      sandbox.stub(logger, 'info')
      await AragonPluginsService.start()

      const queues = [
        EnumQueueName.logDao,
        EnumQueueName.logSelectorPermission,
        EnumQueueName.plugins,
        EnumQueueName.requeue,
      ]
      expect(processStub.callCount).to.eq(queues.length)

      const handler = processStub.getCall(0).args[1]
      await handler({ id: 'some-id', params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } })

      expect(daoStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logDaoStub.calledOnce).to.be.true
    })

    it('should process the plugins queue and handle tokenVoting interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        hasDelegate: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const queues = [
        EnumQueueName.logDao,
        EnumQueueName.logSelectorPermission,
        EnumQueueName.plugins,
        EnumQueueName.requeue,
      ]
      expect(processStub.callCount).to.eq(queues.length)

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: {
          address: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          isHistorical: false,
        },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)
      expect(logTokenVotingStub.calledOnce).to.be.true
    })

    it('should log an error if plugin is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')

      sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: {
          address: '0xMissingPlugin',
          network: NetworksEnum.ethereumMainnet,
          isHistorical: false,
        },
      })

      expect(pluginStub.calledOnceWith('0xMissingPlugin', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWith('PluginSyncService: plugin not found' as any)).to.be.true
    })

    it('should log an error if interfaceType is missing', async () => {
      sandbox.stub(logger, 'info')

      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: null,
      })
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: {
          address: '0xPluginWithNoType',
          network: NetworksEnum.ethereumMainnet,
          isHistorical: false,
        },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWithMatch('PluginSyncService: plugin not found' as any)).to.be.true
    })
  })

  describe('stop', () => {
    it('should log that the service stopped', async () => {
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonPluginsService.stop()

      expect(loggerStub.calledOnceWith('PluginSyncService service stopped' as any)).to.be.true
    })
  })

  describe('logDao queue', () => {
    it('should process logDao queue and call LogDao.start', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({} as any)
      const logDaoStub = sandbox.stub(LogDao, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(0).args[1]
      await handler({ id: 'some-id', params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } })

      expect(daoStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logDaoStub.calledOnce).to.be.true
    })

    it('should do nothing if DAO is not found', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const logDaoStub = sandbox.stub(LogDao, 'start')

      await AragonPluginsService.start()

      const handler = processStub.getCall(0).args[1]
      await handler({ id: 'some-id', params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } })

      expect(daoStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logDaoStub.notCalled).to.be.true
    })
  })

  describe('logSelectorPermission queue', () => {
    it('should process logSelectorPermission queue and call LogSelectorPermission.start', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves({
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
        conditionAddress: '0xConditionAddress',
      } as any)
      const logSelectorPermissionStub = sandbox.stub(LogSelectorPermission, 'start').resolves()

      sandbox.stub(logger, 'info')
      await AragonPluginsService.start()

      const queues = [
        EnumQueueName.logDao,
        EnumQueueName.logSelectorPermission,
        EnumQueueName.plugins,
        EnumQueueName.requeue,
      ]
      expect(processStub.callCount).to.eq(queues.length)
      expect(processStub.args[1][0]).to.eq(EnumQueueName.logSelectorPermission)

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: {
          address: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          conditionAddress: '0xConditionAddress',
        },
      })

      expect(
        pluginStub.calledOnceWith({
          address: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          conditionAddress: '0xConditionAddress',
        }),
      ).to.be.true
      expect(logSelectorPermissionStub.calledOnce).to.be.true
    })

    it('should log an error if plugin is not found for logSelectorPermission queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')
      const logSelectorPermissionStub = sandbox.stub(LogSelectorPermission, 'start')

      sandbox.stub(logger, 'info')
      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: {
          address: '0xMissingPlugin',
          network: NetworksEnum.ethereumMainnet,
          conditionAddress: '0xConditionAddress',
        },
      })

      expect(
        pluginStub.calledOnceWith({
          address: '0xMissingPlugin',
          network: NetworksEnum.ethereumMainnet,
          conditionAddress: '0xConditionAddress',
        }),
      ).to.be.true
      expect(loggerStub.calledWith('PluginSyncService: plugin not found' as any)).to.be.true
      expect(logSelectorPermissionStub.notCalled).to.be.true
    })

    it('should handle logSelectorPermission queue with all required parameters', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0x1234567890123456789012345678901234567890',
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0x2222222222222222222222222222222222222222',
        interfaceType: 'admin',
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      const logSelectorPermissionStub = sandbox.stub(LogSelectorPermission, 'start').resolves()

      sandbox.stub(logger, 'info')
      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'selector-permission-job',
        params: {
          address: mockPlugin.address,
          network: mockPlugin.network,
          conditionAddress: mockPlugin.conditionAddress,
        },
      })

      expect(
        pluginStub.calledOnceWith({
          address: mockPlugin.address,
          network: mockPlugin.network,
          conditionAddress: mockPlugin.conditionAddress,
        }),
      ).to.be.true
      expect(logSelectorPermissionStub.calledOnceWith(mockPlugin as any)).to.be.true
    })
  })

  describe('plugins queue', () => {
    it('should process plugins queue for admin interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })
      const logAdminStub = sandbox.stub(LogAdmin, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logAdminStub.calledOnce).to.be.true
    })

    it('should process plugins queue for multisig interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.multisig,
        network: NetworksEnum.ethereumMainnet,
      })
      const logMultisigStub = sandbox.stub(LogMultiSig, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logMultisigStub.calledOnce).to.be.true
    })

    it('should process plugins queue for tokenVoting ERC20 interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        hasDelegate: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(logTokenVotingStub.calledOnce).to.be.true
    })

    it('should process plugins queue for tokenVoting EscrowAdapter interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.escrowAdapter,
        isGovernance: true,
        hasDelegate: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(logTokenVotingStub.calledOnce).to.be.true
    })

    it('should process plugins queue for spp interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.spp,
      })
      const logSPPStub = sandbox.stub(LogSpp, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logSPPStub.calledOnce).to.be.true
    })

    it('should process plugins queue for gauge interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Token, 'findOne').resolves({ address: '0xTokenAddress' } as any)
      const logGaugeStub = sandbox.stub(LogGauge, 'start').resolves()
      const runEscrowCrawlerStub = sandbox.stub(LogTokenVoting, 'runEscrowCrawler').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logGaugeStub.calledOnceWith(mockPlugin, false)).to.be.true
      expect(runEscrowCrawlerStub.calledOnce).to.be.true
      expect(runEscrowCrawlerStub.calledOnceWith(mockPlugin, { address: '0xTokenAddress' }, false)).to.be.true
    })

    it('should process plugins queue for gauge interface type when token not found', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Token, 'findOne').resolves(null)
      const logGaugeStub = sandbox.stub(LogGauge, 'start').resolves()
      const runEscrowCrawlerStub = sandbox.stub(LogTokenVoting, 'runEscrowCrawler').resolves()
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logGaugeStub.calledOnceWith(mockPlugin, false)).to.be.true
      expect(runEscrowCrawlerStub.notCalled).to.be.true
      expect(loggerWarnStub.calledWith('Sync plugin token not found' as any)).to.be.true
    })

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerInfoStub.calledWith('Sync plugin: Capital Distributor' as any)).to.be.true
      expect(logCapitalDistributorStub.calledOnceWith(mockPlugin)).to.be.true
    })

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.capitalDistributor,
        address: '0xPluginAddress',
      })
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()
      sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logCapitalDistributorStub.calledOnce).to.be.true
    })

    it('should log an error if plugin is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xMissingPlugin', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xMissingPlugin', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWithMatch('plugin not found' as any)).to.be.true
    })

    it('should log an error if interfaceType is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: null,
      })
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginWithNoType', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWithMatch('PluginSyncService: plugin not found' as any)).to.be.true
    })

    it('should log an error if interfaceType is not supported', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: 'not-supported',
      })

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginWithNoType', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('requeue queue', () => {
    it('should process plugins queue for admin interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })
      const logAdminStub = sandbox.stub(LogAdmin, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logAdminStub.calledOnce).to.be.true
    })

    it('should process plugins queue for multisig interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.multisig,
        network: NetworksEnum.ethereumMainnet,
      })
      const logMultisigStub = sandbox.stub(LogMultiSig, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logMultisigStub.calledOnce).to.be.true
    })

    it('should process plugins queue for tokenVoting ERC20 interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        hasDelegate: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(logTokenVotingStub.calledOnce).to.be.true
    })

    it('should process plugins queue for tokenVoting EscrowAdapter interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.escrowAdapter,
        isGovernance: true,
        hasDelegate: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(logTokenVotingStub.calledOnce).to.be.true
    })

    it('should log a warning if token is not GovernanceERC20 for tokenVoting', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: 'NonGovernanceToken',
      } as any)

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)
    })

    it('should process plugins queue for spp interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.spp,
      })
      const logSPPStub = sandbox.stub(LogSpp, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logSPPStub.calledOnce).to.be.true
    })

    it('should process plugins queue for gauge interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Token, 'findOne').resolves({ address: '0xTokenAddress' } as any)
      const logGaugeStub = sandbox.stub(LogGauge, 'start').resolves()
      const runEscrowCrawlerStub = sandbox.stub(LogTokenVoting, 'runEscrowCrawler').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logGaugeStub.calledOnceWith(mockPlugin, false)).to.be.true
      expect(runEscrowCrawlerStub.calledOnce).to.be.true
      expect(runEscrowCrawlerStub.calledOnceWith(mockPlugin, { address: '0xTokenAddress' }, false)).to.be.true
    })

    it('should process plugins queue for gauge interface type when token not found', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Token, 'findOne').resolves(null)
      const logGaugeStub = sandbox.stub(LogGauge, 'start').resolves()
      const runEscrowCrawlerStub = sandbox.stub(LogTokenVoting, 'runEscrowCrawler').resolves()
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logGaugeStub.calledOnceWith(mockPlugin, false)).to.be.true
      expect(runEscrowCrawlerStub.notCalled).to.be.true
      expect(loggerWarnStub.calledWith('Sync plugin token not found' as any)).to.be.true
    })

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerInfoStub.calledWith('Sync plugin: Capital Distributor' as any)).to.be.true
      expect(logCapitalDistributorStub.calledOnceWith(mockPlugin)).to.be.true
    })

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.capitalDistributor,
        address: '0xPluginAddress',
      })
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()
      sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logCapitalDistributorStub.calledOnce).to.be.true
    })

    it('should log an error if plugin is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xMissingPlugin', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xMissingPlugin', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWithMatch('plugin not found' as any)).to.be.true
    })

    it('should log an error if interfaceType is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: null,
      })
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginWithNoType', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerStub.calledWithMatch('PluginSyncService: plugin not found' as any)).to.be.true
    })

    it('should log an error if interfaceType is not supported', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: 'not-supported',
      })

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginWithNoType', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
    })
  })
})
