import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import { EnumQueueName, IMetricAction, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { LogDescription } from 'ethers'

describe('GovernanceErc20Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('delegateVotesChanged', () => {
    it('should return if the delegate event is from zero address', async () => {
      const fakeLog = {
        args: {
          delegate: utils.zeroAddress,
        },
      }

      const logInfo = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12313123,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: utils.zeroAddress,
        address: utils.zeroAddress,
        eventName: 'DelegateVotesChanged',
      }

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)
      expect(handlerResponse).to.be.undefined
    })

    it('should return if plugin is not found', async () => {
      const fakeLog = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '1000',
          newBalance: '2000',
        },
      }

      const logInfo = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12345678,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0xTransactionHash',
        address: '0xTokenAddress',
        eventName: 'DelegateVotesChanged',
      }

      const findPluginStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(handlerResponse).to.be.undefined
      expect(findPluginStub.calledOnce).to.be.true
      expect(findPluginStub.calledWith(logInfo.address, logInfo.network)).to.be.true
    })

    it('should return if existing log is found', async () => {
      const fakeLog = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '1000',
          newBalance: '2000',
        },
      }

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const logInfo = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12345678,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0xTransactionHash',
        address: '0xTokenAddress',
        eventName: 'DelegateVotesChanged',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.polygonMainnet,
      } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: fakeLog.args.delegate } as any)
      const existingPlugintub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(true)
      const existingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(true)

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(loggerErrorStub.calledOnceWith('DelegateVotesChanged - already processed' as any))
      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.calledOnce).to.be.true
      expect(existingLogStub.calledOnce).to.be.true
      expect(existingPlugintub.calledOnce).to.be.true
    })

    it('should handle incoming delegateVotesChanged event and add member to DAO', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '1000',
          newBalance: '2000',
        },
      } as unknown as LogDescription

      const info = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.polygonMainnet,
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: '0xTo' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      const memberTransactionCreateStub = sandbox.stub(Models.MemberTransaction, 'create').resolves({
        memberBalance: '1500',
        memberVotingPower: '2000',
      } as any)

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      expect(findByAddressStub.calledOnceWithExactly(info.address, info.network)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(info.blockNumber, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(
        updateMetricsStub.calledOnceWithExactly(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress: parsedEvent.args.delegate,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
      expect(
        addToDaoStub.calledOnceWithExactly({
          memberAddress: parsedEvent.args.delegate,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
      expect(
        sendMessageStub.calledOnceWithExactly(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: plugin.network },
        }),
      ).to.be.true

      expect(loggerVerboseStub.calledTwice).to.be.true
    })
  })
})
