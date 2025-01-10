import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import {
  EnumQueueName,
  IEventLogMember,
  ILogInfo,
  IMetricAction,
  ITransferSide,
  ITransferType,
  NetworksEnum,
} from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { LogDescription } from 'ethers'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

describe('GovernanceErc20Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('delegateVotesChanged', () => {
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

    it('should return if delegate is zero address', async () => {
      const fakeLog = {
        args: {
          delegate: '0x0000000000000000000000000000000000000000',
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

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.polygonMainnet,
      } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.notCalled).to.be.true
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
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
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
        .resolves({ from: '0xFrom', to: memberAddress })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(findByAddressStub.calledOnceWithExactly(info.address, info.network)).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.incoming)
      expect(memberTransaction.memberBalance).to.be.eq('1500')
      expect(memberTransaction.memberVotingPower).to.be.eq('2000')

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

    it('should handle incoming delegateVotesChanged event and not add member if to is zero address', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
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
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(findByAddressStub.calledOnceWithExactly(info.address, info.network)).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.incoming)
      expect(memberTransaction.memberBalance).to.be.eq('1500')
      expect(memberTransaction.memberVotingPower).to.be.eq('2000')

      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(info.blockNumber, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(updateMetricsStub.notCalled).to.be.true
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

    it('should handle outgoing delegateVotesChanged event and add member to DAO', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '2000',
          newBalance: '1000',
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

      sandbox.stub(Logger, 'verbose')

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: memberAddress, to: '0xTo' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

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

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberBalance).to.be.eq('1500')
      expect(memberTransaction.memberVotingPower).to.be.eq('1000')

      expect(
        updateMetricsStub.calledOnceWithExactly(IMetricAction.increaseDelegateSentCount, {
          memberAddress: parsedEvent.args.delegate,
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

      expect(
        addToDaoStub.calledOnceWithExactly({
          memberAddress: parsedEvent.args.delegate,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
    })

    it('should handle outgoing delegateVotesChanged event and remove member if from is zero address', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
          previousBalance: '1000',
          newBalance: '0',
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

      sandbox.stub(Logger, 'verbose')

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: '0xTo' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)
      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(findByAddressStub.calledOnceWithExactly(info.address, info.network)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(info.blockNumber, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberBalance).to.be.eq('0')
      expect(memberTransaction.memberVotingPower).to.be.eq('0')

      expect(updateMetricsStub.notCalled).to.be.true
      expect(addToDaoStub.calledOnce).to.be.false
      expect(removeFromDaoStub.calledOnce).to.be.true
      expect(
        removeFromDaoStub.calledWith({
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
    })
  })

  describe('_outgoingTransfer', () => {
    it('should handle outgoing transfer event and remove member from DAO', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.from } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const mockBalance = {
        amount: '0',
        votingPower: '0',
        decreaseBalance: null,
        id: 'logDbId',
      }

      mockBalance.decreaseBalance = sandbox.stub().resolves(mockBalance) as any

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalance)

      sandbox.stub(Logger, 'verbose')

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info as any, plugin as any)
      const memberTransaction = await Models.MemberTransaction.findOne({})

      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.from)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(info.blockNumber, info.network)).to.be.true
      expect(getPastVotesStub.calledOnce).to.be.true
      expect(
        getPastVotesStub.calledWith(parsedEvent.args.from, info.address, info.blockNumber, 1630425600, info.network),
      ).to.be.true

      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.tokenTransfer)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberBalance).to.be.eq('0')
      expect(memberTransaction.memberVotingPower).to.be.eq('0')

      expect(removeFromDaoStub.calledOnce).to.be.true
      expect(
        removeFromDaoStub.calledWith({
          memberAddress: parsedEvent.args.from,
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
    })

    it('should return if the existing log is found', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.from } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(true)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const handlerResponse = await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info as any, plugin as any)

      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.from)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Transfer - outgoing transfer already processed' as any))
    })
  })

  describe('_incomingTransfer', () => {
    it('should return if the existing log is found', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.to } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(true)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const handlerResponse = await GovernanceErc20Handler._incomingTransfer(parsedEvent, info as any, plugin as any)

      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.to)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Transfer - incoming transfer already processed' as any))
    })

    it('should handle incoming transfer event and add member to DAO', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.to } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const mockBalance = {
        amount: '12',
        votingPower: '10',
        increaseBalance: null,
        id: 'logDbId',
      }

      mockBalance.increaseBalance = sandbox.stub().resolves(mockBalance) as any

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalance)

      sandbox.stub(Logger, 'verbose')

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('10')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()

      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler._incomingTransfer(parsedEvent, info as any, plugin as any)
      const memberTransaction = await Models.MemberTransaction.findOne({})

      expect(createMemberStub.calledOnceWithExactly(parsedEvent.args.to)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(info.blockNumber, info.network)).to.be.true
      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.calledWith(parsedEvent.args.to, info.address, info.blockNumber, 1630425600, info.network))
        .to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.tokenTransfer)
      expect(memberTransaction.side).to.be.eq(ITransferSide.incoming)
      expect(memberTransaction.memberBalance).to.be.eq('12')
      expect(memberTransaction.memberVotingPower).to.be.eq('10')

      expect(addToDaoStub.calledOnce).to.be.true
      expect(
        addToDaoStub.calledWith({
          memberAddress: parsedEvent.args.to,
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
    })
  })

  describe('_findDelegatorsFromReceipt', () => {
    it('should return zero addresses if the transaction receipt is not found', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegateAddress',
        },
      } as unknown as LogDescription

      const info = {
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0xTransactionHash',
      } as ILogInfo

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      expect(result.from).to.equal(utils.zeroAddress)
      expect(result.to).to.equal(utils.zeroAddress)
      expect(getTransactionReceiptStub.calledOnceWithExactly(info.transactionHash, info.network)).to.be.true
    })

    it('should return from and to delegates when matching delegator is found', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegatorAddress',
        },
      } as unknown as LogDescription

      const info = {
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0xTransactionHash',
      } as ILogInfo

      const txReceipt = {
        logs: [
          {
            topics: [],
            data: '',
            address: '0xTokenAddress',
          },
        ],
      }

      const delegateChangedLog = {
        parsed: {
          args: {
            delegator: '0xDelegatorAddress',
            fromDelegate: '0xFromDelegate',
            toDelegate: '0xToDelegate',
          },
        },
        txLog: txReceipt.logs[0],
      }

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      const findLogsByNameStub = sandbox.stub(Web3Helper, 'findLogsByName').returns([delegateChangedLog as any])

      const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      expect(result.from).to.equal('0xFromDelegate')
      expect(result.to).to.equal('0xToDelegate')
      expect(getTransactionReceiptStub.calledOnceWithExactly(info.transactionHash, info.network)).to.be.true
      expect(
        findLogsByNameStub.calledOnceWithExactly(
          txReceipt as any,
          IEventLogMember.DelegateChanged,
          GovernanceERC20.abi,
        ),
      ).to.be.true
    })

    it('should return zero addresses if no matching delegator is found', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegatorAddress',
        },
      } as unknown as LogDescription

      const info = {
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0xTransactionHash',
      } as ILogInfo

      const txReceipt = {
        logs: [
          {
            topics: [],
            data: '',
            address: '0xTokenAddress',
          },
        ],
      }

      const delegateChangedLog = {
        parsed: {
          args: {
            delegator: '0xAnotherDelegator',
            fromDelegate: '0xFromDelegate',
            toDelegate: '0xToDelegate',
          },
        },
        txLog: txReceipt.logs[0],
      }

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      const findLogsByNameStub = sandbox.stub(Web3Helper, 'findLogsByName').returns([delegateChangedLog as any])

      const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      expect(result.from).to.equal(utils.zeroAddress)
      expect(result.to).to.equal(utils.zeroAddress)
      expect(getTransactionReceiptStub.calledOnceWithExactly(info.transactionHash, info.network)).to.be.true
      expect(
        findLogsByNameStub.calledOnceWithExactly(
          txReceipt as any,
          IEventLogMember.DelegateChanged,
          GovernanceERC20.abi,
        ),
      ).to.be.true
    })
  })

  describe('transfer', () => {
    it('should handle transfer when plugin is not provided', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const findPluginStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const _outGoingTransferStub = sandbox.stub(GovernanceErc20Handler, '_outgoingTransfer').resolves()
      const _incomingTransferStub = sandbox.stub(GovernanceErc20Handler, '_incomingTransfer').resolves()

      const handlerResponse = await GovernanceErc20Handler.transfer(parsedEvent, info as any)

      expect(handlerResponse).to.be.undefined
      expect(findPluginStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(_outGoingTransferStub.calledOnce).to.be.true
      expect(_incomingTransferStub.calledOnce).to.be.true
    })

    it('should return if the plugin is not found', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          value: '1000',
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

      const findPluginStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      const handlerResponse = await GovernanceErc20Handler.transfer(parsedEvent, info as any)

      expect(handlerResponse).to.be.undefined
      expect(findPluginStub.calledOnceWith(info.address, info.network)).to.be.true
    })
  })
})
