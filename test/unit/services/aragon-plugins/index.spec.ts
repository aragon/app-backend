import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonPluginsService from '@services/aragon-plugins/index'
import logger from '@logger'
import { EnumQueueName, IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { Models } from '@dbModels'
import { LogDao } from '@plugins/logDao'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { LogAdmin } from '@plugins/logAdmin'
import { LogSpp } from '@plugins/logSPP'
import { LogGauge } from '@plugins/logGauge'
import { LogMultiSig } from '@plugins/logMultisig'

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

      expect(processStub.calledTwice).to.be.true
      expect(processStub.args[0][0]).to.eq(EnumQueueName.logDao)
      expect(processStub.args[1][0]).to.eq(EnumQueueName.plugins)

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
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      sandbox.stub(logger, 'info')

      await AragonPluginsService.start()

      expect(processStub.calledTwice).to.be.true

      const handler = processStub.getCall(1).args[1]
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

      const handler = processStub.getCall(1).args[1]
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

      const handler = processStub.getCall(1).args[1]
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

  describe('plugins queue', () => {
    it('should process plugins queue for admin interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })
      const logAdminStub = sandbox.stub(LogAdmin, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
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

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logMultisigStub.calledOnce).to.be.true
    })

    it('should process plugins queue for tokenVoting interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
      } as any)
      const logTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
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
      const loggerStub = sandbox.stub(logger, 'warn')

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(loggerStub.calledWithMatch('token not governance erc20' as any)).to.be.true
    })

    it('should process plugins queue for spp interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.spp,
      })
      const logSPPStub = sandbox.stub(LogSpp, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logSPPStub.calledOnce).to.be.true
    })

    it('should process plugins queue for gauge interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: ITokenType.ERC721,
      } as any)
      const logGaugeStub = sandbox.stub(LogGauge, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(logGaugeStub.calledOnce).to.be.true
    })

    it('should log a warning if token is not ERC721 for gauge interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
      })
      const proxyTokenStub = sandbox.stub(Models.Token, 'findOne').resolves({
        type: 'NonGovernanceToken',
      } as any)
      const loggerStub = sandbox.stub(logger, 'warn')

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(loggerStub.calledWithMatch('Sync plugin: token not ERC721' as any)).to.be.true
    })

    it('should log an error if plugin is missing', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(1).args[1]
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

      const handler = processStub.getCall(1).args[1]
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

      const handler = processStub.getCall(1).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginWithNoType', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginWithNoType', NetworksEnum.ethereumMainnet)).to.be.true
    })
  })
})
