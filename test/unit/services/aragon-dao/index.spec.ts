import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonDaoService from '@services/aragon-dao/index'
import logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { ContractInfo } from '@services/aragon-dao/contractInfo'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import ActionDecoder from '@services/aragon-dao/actionDecoder'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import config from '@config'
import Plugin from '@src/services/aragon-dao/plugin'

describe('AragonDao: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopAllTasks()
  })

  describe('start', () => {
    it('should initialize RabbitMQ processing for all queues', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonDaoService.start()

      expect(processStub.callCount).to.equal(14)
      expect(processStub.calledWith(EnumQueueName.allMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoTransactions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoAssets)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalMultisigMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.memberBalance)).to.be.true
      expect(processStub.calledWith(EnumQueueName.getVotingPower)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractDecoder)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalActions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.canCreateProposal)).to.be.true
      expect(processStub.calledWith(EnumQueueName.pluginInstallationData)).to.be.true
      expect(processStub.calledWith(EnumQueueName.getLockVotingPowerBatch)).to.be.true

      expect(loggerStub.calledOnceWith('AragonDaoService service started' as any)).to.be.true
    })
  })

  describe('stop', () => {
    it('should log that the service stopped', async () => {
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonDaoService.stop()

      expect(loggerStub.calledOnceWith('AragonDaoService service stopped' as any)).to.be.true
    })
  })

  describe('RabbitMQ queue handlers', () => {
    it('should handle allMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const allMetricsStub = sandbox.stub(AllMetrics, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(0).args[1]
      const queueName = processStub.getCall(0).args[0]
      await handler({ params: { network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.allMetrics)
      expect(
        allMetricsStub.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle daoTransactions queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoTransactionsStub = sandbox.stub(DaoTransactions, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(1).args[1]
      const queueName = processStub.getCall(1).args[0]
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoTransactions)
      expect(
        daoTransactionsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle daoAssets queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoAssetsStub = sandbox.stub(DaoAssets, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(2).args[1]
      const queueName = processStub.getCall(2).args[0]
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoAssets)
      expect(
        daoAssetsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle daoMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(3).args[1]
      const queueName = processStub.getCall(3).args[0]
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoMetrics)
      expect(
        daoMetricsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle proposalMultisigMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proposalMetricsStub = sandbox.stub(ProposalMetrics, 'proposalMultisigMetrics').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(4).args[1]
      const queueName = processStub.getCall(4).args[0]
      await handler({
        params: {
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.proposalMultisigMetrics)
      expect(
        proposalMetricsStub.calledOnceWith({
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        } as any),
      ).to.be.true
    })

    it('should handle proposalTokenVotingMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proposalMetricsStub = sandbox.stub(ProposalMetrics, 'proposalTokenVotingMetrics').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(5).args[1]
      const queueName = processStub.getCall(5).args[0]
      await handler({
        params: {
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.proposalTokenVotingMetrics)
      expect(
        proposalMetricsStub.calledOnceWith({
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        } as any),
      ).to.be.true
    })

    it('should handle contractInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const contractStub = sandbox.stub(ContractInfo, 'getContractInfo').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(6).args[1]
      const queueName = processStub.getCall(6).args[0]
      await handler({ params: { address: '0x0', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.contractInfo)
      expect(contractStub.args[0][0]).to.equal(NetworksEnum.ethereumMainnet)
      expect(contractStub.args[0][1]).to.equal('0x0')
      expect(contractStub.calledOnce).to.be.true
    })

    it('should handle getVotingPower queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'getVotingPower').resolves('5000')

      await AragonDaoService.start()

      const handler = processStub.getCall(7).args[1]
      const queueName = processStub.getCall(7).args[0]
      const result = await handler({
        params: {
          userAddress: '0x0User',
          tokenAddress: '0x0Token',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.getVotingPower)
      expect(memberInfoStub.calledOnceWith('0x0User', '0x0Token', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal('5000')
    })

    it('should handle getLockVotingPowerBatch queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'getLockVotingPowerBatch').resolves([])

      await AragonDaoService.start()

      const handler = processStub.getCall(8).args[1]
      const queueName = processStub.getCall(8).args[0]
      await handler({
        params: {
          locks: [{ lockId: 'lock1', network: NetworksEnum.ethereumMainnet }],
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.getLockVotingPowerBatch)
      expect(memberInfoStub.calledOnceWith([{ lockId: 'lock1', network: NetworksEnum.ethereumMainnet }])).to.be.true
    })

    it('should handle memberBalance queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'getByTokenAddress').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(9).args[1]
      const queueName = processStub.getCall(9).args[0]
      await handler({
        params: {
          userAddress: 'userAddress',
          tokenAddress: 'tokenAddress',
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: 'pluginAddress',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.memberBalance)
      expect(
        memberInfoStub.calledOnceWith('userAddress', 'pluginAddress', 'tokenAddress', NetworksEnum.ethereumMainnet),
      ).to.be.true
    })

    it('should handle contractDecoder queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeStub = sandbox.stub(ActionDecoder, 'decode').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(10).args[1]
      const queueName = processStub.getCall(10).args[0]
      await handler({
        params: {
          from: 'userAddress1',
          to: 'userAddress2',
          data: '0x0',
          value: 1,
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.contractDecoder)
      expect(decodeStub.args[0][0]).to.deep.equal({
        from: 'userAddress1',
        to: 'userAddress2',
        data: '0x0',
        value: 1,
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should handle proposal actions queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeStub = sandbox.stub(ActionDecoder, 'proposalActionDecoder').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(11).args[1]
      const queueName = processStub.getCall(11).args[0]
      await handler({ params: { id: 'proposalId' } } as any)

      expect(queueName).to.eq(EnumQueueName.proposalActions)
      expect(decodeStub.args[0][0]).to.deep.equal('proposalId')
    })

    it('should handle canCreateProposal queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'canCreateProposal').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(12).args[1]
      const queueName = processStub.getCall(12).args[0]

      await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          memberAddress: '0xUserAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.canCreateProposal)
      expect(memberInfoStub.calledOnceWith('0xPluginAddress', '0xUserAddress', NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should handle pluginInstallationData queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginInstallationStub = sandbox.stub(Plugin, 'getInstallationData').resolves('{"installationData":"test"}')

      await AragonDaoService.start()

      const handler = processStub.getCall(13).args[1]
      const queueName = processStub.getCall(13).args[0]

      const result = await handler({
        params: {
          address: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.pluginInstallationData)
      expect(pluginInstallationStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal('{"installationData":"test"}')
    })
  })

  describe('Task Scheduler', () => {
    it('should initialize the token fetcher task scheduler', async () => {
      sandbox.stub(RabbitMQHelper, 'process').resolves()

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }

      const getInstanceStub = sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox.stub(config, 'SERVICES').value({
        ARAGON_DAO: {
          TOKEN_FETCH_INTERVAL: 60000,
        },
      })

      sandbox.stub(logger, 'info')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      await AragonDaoService.start()

      expect(getInstanceStub.calledOnce).to.be.true

      expect(mockScheduler.startTask.calledOnce).to.be.true
      expect(mockScheduler.startTask.args[0][0]).to.equal('token-re-fetch')

      const taskOptions = mockScheduler.startTask.args[0][1]

      expect(taskOptions).to.have.property('fn')
      expect(taskOptions).to.have.property('interval', 60000)
      expect(taskOptions).to.have.property('checkInterval', 30000)
      expect(taskOptions).to.have.property('runNow', true)
      expect(taskOptions).to.have.property('stopOnError', false)
      expect(taskOptions).to.have.property('onError')

      const fnResult = taskOptions.fn()
      expect(fnResult).to.be.an('array')
      expect(fnResult[0][0]).to.have.property('fetchRates')

      taskOptions.onError(new Error('Test error'))
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.args[0][0]).to.equal('Token Fetcher task error')
    })
  })
})
