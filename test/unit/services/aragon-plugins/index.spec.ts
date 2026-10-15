import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { LogAdmin } from '@plugins/logAdmin'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'
import { LogDao } from '@plugins/logDao'
import { LogGauge } from '@plugins/logGauge'
import { LogMultiSig } from '@plugins/logMultisig'
import { LogPolicy } from '@plugins/logPolicy'
import { LogSelectorPermission } from '@plugins/logSelectorPermission'
import { LogSpp } from '@plugins/logSPP'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@services/aragon-plugins/index'
import { LogDelegateChanged } from '@services/aragon-plugins/logDelegateChanged'
import { EnumQueueName, IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
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
        EnumQueueName.syncDelegateChanged,
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
        EnumQueueName.syncDelegateChanged,
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
    beforeEach(() => {
      sandbox.stub(logger, 'info')
    })

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
    const params = {
      address: '0x1234567890123456789012345678901234567890',
      daoAddress: '0x9876543210987654321098765432109876543210',
      network: NetworksEnum.ethereumMainnet,
      conditionAddress: '0x2222222222222222222222222222222222222222',
    }
    const createRow = (status: IPluginStatus, overrides: Partial<typeof params> & { transactionHash?: string } = {}) =>
      Models.Plugin.create({
        ...params,
        status,
        interfaceType: IPluginInterfaceType.admin,
        transactionHash: status,
        blockNumber: 1,
        ...overrides,
      })

    beforeEach(() => {
      sandbox.stub(logger, 'info')
    })

    it('starts the selector crawl with the installed row after a deprecated row', async () => {
      const deprecated = await createRow(IPluginStatus.deprecated)
      const installed = await createRow(IPluginStatus.installed)
      const process = sandbox.stub(RabbitMQHelper, 'process')
      const crawl = sandbox.stub(LogSelectorPermission, 'start').resolves()
      await AragonPluginsService.start()

      expect(process.callCount).to.equal(5)
      expect(process.getCall(1).args[0]).to.equal(EnumQueueName.logSelectorPermission)
      await process.getCall(1).args[1]({ id: 'selector-job', params })

      expect(crawl.calledOnce).to.be.true
      expect(crawl.firstCall.args[0].id).to.equal(installed.id)
      expect(crawl.firstCall.args[0].daoAddress).to.equal(params.daoAddress)
      expect(await Models.Plugin.findByEntityId(deprecated.id)).to.include({ status: IPluginStatus.deprecated })
    })

    for (const [field, value] of Object.entries({
      address: '0x3333333333333333333333333333333333333333',
      daoAddress: '0x4444444444444444444444444444444444444444',
      network: NetworksEnum.polygonMainnet,
      conditionAddress: '0x5555555555555555555555555555555555555555',
    })) {
      it(`ignores an installed row with a different ${field}`, async () => {
        await createRow(IPluginStatus.installed, { [field]: value, transactionHash: 'unrelated' })
        const process = sandbox.stub(RabbitMQHelper, 'process')
        const crawl = sandbox.stub(LogSelectorPermission, 'start').resolves()
        sandbox.stub(logger, 'error')
        await AragonPluginsService.start()
        const handler = process.getCall(1).args[1]

        await handler({ id: 'selector-job', params })
        expect(crawl.notCalled).to.be.true

        const matching = await createRow(IPluginStatus.installed)
        await handler({ id: 'selector-job', params })
        expect(crawl.calledOnce).to.be.true
        expect(crawl.firstCall.args[0].id).to.equal(matching.id)
      })
    }

    for (const status of [IPluginStatus.deprecated, IPluginStatus.uninstalled]) {
      it(`does not start a selector crawl when the only row is ${status}`, async () => {
        const plugin = await createRow(status)
        const before = plugin.toObject()
        const process = sandbox.stub(RabbitMQHelper, 'process')
        const crawl = sandbox.stub(LogSelectorPermission, 'start').resolves()
        sandbox.stub(logger, 'error')
        await AragonPluginsService.start()

        await process.getCall(1).args[1]({ id: 'selector-job', params })

        expect(crawl.notCalled).to.be.true
        expect((await Models.Plugin.findByEntityId(plugin.id)).toObject()).to.deep.equal(before)
      })
    }

    it('logs when no plugin matches the selector job', async () => {
      const process = sandbox.stub(RabbitMQHelper, 'process')
      const errorLog = sandbox.stub(logger, 'error')
      const crawl = sandbox.stub(LogSelectorPermission, 'start').resolves()
      await AragonPluginsService.start()

      await process.getCall(1).args[1]({ id: 'selector-job', params })

      expect(await Models.Plugin.countDocuments()).to.equal(0)
      expect(errorLog.calledOnceWith('PluginSyncService: plugin not found' as any)).to.be.true
      expect(crawl.notCalled).to.be.true
    })

    it('starts the selector crawl when the job has no DAO address', async () => {
      const plugin = await createRow(IPluginStatus.installed)
      const process = sandbox.stub(RabbitMQHelper, 'process')
      const crawl = sandbox.stub(LogSelectorPermission, 'start').resolves()
      await AragonPluginsService.start()

      await process.getCall(1).args[1]({
        id: 'selector-job',
        params: { address: params.address, network: params.network, conditionAddress: params.conditionAddress },
      })

      expect(crawl.calledOnce).to.be.true
      expect(crawl.firstCall.args[0].id).to.equal(plugin.id)
      expect(crawl.firstCall.args[0].conditionAddress).to.equal(params.conditionAddress)
    })
  })

  describe('plugins queue', () => {
    let loggerInfoStub: sinon.SinonStub

    beforeEach(() => {
      loggerInfoStub = sandbox.stub(logger, 'info')
    })

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

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()

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

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logCapitalDistributorStub.calledOnce).to.be.true
    })

    it('should process plugins queue for claimer interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.claimer,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logPolicyStub = sandbox.stub(LogPolicy, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerInfoStub.calledWith(`Sync plugin: ${IPluginInterfaceType.claimer}` as any)).to.be.true
      expect(logPolicyStub.calledOnceWith(mockPlugin.address, mockPlugin.network)).to.be.true
    })

    it('should process plugins queue for router interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.router,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logPolicyStub = sandbox.stub(LogPolicy, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(2).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerInfoStub.calledWith(`Sync plugin: ${IPluginInterfaceType.router}` as any)).to.be.true
      expect(logPolicyStub.calledOnceWith(mockPlugin.address, mockPlugin.network)).to.be.true
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
    let loggerInfoStub: sinon.SinonStub

    beforeEach(() => {
      loggerInfoStub = sandbox.stub(logger, 'info')
    })

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
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await AragonPluginsService.start()

      const handler = processStub.getCall(3).args[1]
      await handler({
        id: 'some-id',
        params: { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, isHistorical: false },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true

      expect(proxyTokenStub.args[0][0].address).to.be.eq('0xTokenAddress')
      expect(proxyTokenStub.args[0][0].network).to.be.eq(NetworksEnum.ethereumMainnet)

      expect(loggerWarnStub.calledWith('Sync plugin token not supported' as any)).to.be.true
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

    it('should process plugins queue for capitalDistributor interface type', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockPlugin = {
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      const logCapitalDistributorStub = sandbox.stub(LogCapitalDistributor, 'start').resolves()

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

    it('should call LogDelegateChanged.start when syncDelegateChanged message is received', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 100,
      } as any)
      const logDelegateChangedStub = sandbox.stub(LogDelegateChanged, 'start').resolves()

      await AragonPluginsService.start()

      const handler = processStub.getCall(4).args[1]
      await handler({
        id: 'some-id',
        params: { pluginAddress: '0xPluginAddress', network: NetworksEnum.ethereumMainnet },
      })

      expect(pluginStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(logDelegateChangedStub.calledOnce).to.be.true
    })

    it('should log error and not call LogDelegateChanged.start when plugin not found for syncDelegateChanged', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const logDelegateChangedStub = sandbox.stub(LogDelegateChanged, 'start').resolves()
      const loggerStub = sandbox.stub(logger, 'error')

      await AragonPluginsService.start()

      const handler = processStub.getCall(4).args[1]
      await handler({
        id: 'some-id',
        params: { pluginAddress: '0xMissingPlugin', network: NetworksEnum.ethereumMainnet },
      })

      expect(logDelegateChangedStub.called).to.be.false
      expect(loggerStub.calledWith('syncDelegateChanged: plugin not found' as any)).to.be.true
    })
  })
})
