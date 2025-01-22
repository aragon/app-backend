import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import {
  EnumQueueName,
  IEventLogMember,
  ILogInfo,
  IMetricAction,
  ITokenType,
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
import { RabbitMQHelper } from '@helpers/radditMQ'
import { LogDescription } from 'ethers'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ProxyToken } from '@modules/proxyToken'
import config from '@config'

describe('GovernanceErc20Handler', () => {
  let sandbox: SinonSandbox
  let intervalTime: number
  let network: NetworksEnum

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    network = NetworksEnum.polygonMainnet
    intervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0
  })

  afterEach(() => {
    sandbox.restore()
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = intervalTime
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
        network,
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
        network,
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
        network,
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
        network,
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
        network,
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
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
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(findByAddressStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.incoming)
      expect(memberTransaction.memberBalance).to.be.eq('1500')
      expect(memberTransaction.memberVotingPower).to.be.eq('2000')
      expect(createMemberStub.calledOnceWith(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true
      expect(updateActivityStub.calledOnce).to.be.true
      expect(
        updateMetricsStub.calledOnceWith(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress: parsedEvent.args.delegate,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
      expect(
        addToDaoStub.calledOnceWith({
          memberAddress: parsedEvent.args.delegate,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
      expect(
        sendMessageStub.calledOnceWith(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: plugin.network },
        }),
      ).to.be.true

      expect(loggerVerboseStub.calledOnce).to.be.true
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: '0xTo' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(findByAddressStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(memberTransaction).to.be.null

      expect(createMemberStub.calledOnceWith(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.notCalled).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.notCalled).to.be.true
      expect(updateMetricsStub.notCalled).to.be.true
      expect(updateActivityStub.notCalled).to.be.true
      expect(
        addToDaoStub.calledOnceWith({
          memberAddress: parsedEvent.args.delegate,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true
      expect(sendMessageStub.notCalled).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error cannot detect delegation side' as any)).to.be.true
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
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

      expect(findByAddressStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(createMemberStub.calledTwice).to.be.true
      expect(createMemberStub.args[0][0]).to.eq(parsedEvent.args.delegate)
      expect(createMemberStub.args[1][0]).to.eq(parsedEvent.args.delegate)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledTwice).to.be.true
      expect(getBlockTimestampStub.args[0][0]).to.eq(info.blockNumber)
      expect(getBlockTimestampStub.args[0][1]).to.eq(info.network)
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.calledOnce).to.be.true

      const memberTransaction = await Models.MemberTransaction.findOne({})
      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberBalance).to.be.eq('1500')
      expect(memberTransaction.memberVotingPower).to.be.eq('1000')

      expect(
        updateMetricsStub.calledOnceWith(IMetricAction.increaseDelegateSentCount, {
          memberAddress: parsedEvent.args.delegate,
          pluginAddress: plugin.address,
          network: info.network,
        }),
      ).to.be.true

      expect(
        sendMessageStub.calledOnceWith(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: plugin.network },
        }),
      ).to.be.true

      expect(
        addToDaoStub.calledOnceWith({
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)
      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)
      const loggerErrorStub = sandbox.stub(Logger, 'error')
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
      expect(findByAddressStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(createMemberStub.calledOnceWith(parsedEvent.args.delegate)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(findDelegatorsStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.notCalled).to.be.true
      expect(memberTransaction).to.be.null
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(memberTransactionCreateStub.notCalled).to.be.true

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
      expect(sendMessageStub.notCalled).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error cannot detect delegation side' as any)).to.be.true
    })

    it('should handle incoming delegateVotesChanged event in parallel', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '1000',
          newBalance: '2000',
        },
      } as unknown as LogDescription

      const info = {
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      sandbox.stub(ProxyMember, 'createMember').resolves({ address: parsedEvent.args.delegate } as any)
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({ from: '0xFrom', to: '0xTo' })
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.spy(Models.MemberTransaction, 'create')

      sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const [result1, result2, result3] = (await Promise.all([
        await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any),
        await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any),
        await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any),
      ])) as any

      const memberTransactions = await Models.MemberTransaction.find({
        memberBalance: '1500',
        memberVotingPower: '2000',
        side: ITransferSide.incoming,
        type: ITransferType.delegate,
      })

      expect(result1?.address).to.eq(memberTransactions.address)
      expect(result2?.address).to.eq(memberTransactions.address)
      expect(result3?.address).to.eq(memberTransactions.address)
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
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

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalance as any)

      sandbox.stub(Logger, 'verbose')

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: ITokenType.GovernanceERC20,
      } as any)
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info as any, plugin as any)
      const memberTransaction = await Models.MemberTransaction.findOne({})

      expect(createMemberStub.calledOnceWith(parsedEvent.args.from)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true
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
        sendMessageStub.calledOnceWith(EnumQueueName.daoMetrics, {
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
      }

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.from } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(true)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const handlerResponse = await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info as any, plugin as any)

      expect(handlerResponse).to.be.false
      expect(createMemberStub.calledOnceWith(parsedEvent.args.from)).to.be.true
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
      }

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.to } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(true)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const handlerResponse = await GovernanceErc20Handler._incomingTransfer(parsedEvent, info as any, plugin as any)

      expect(handlerResponse).to.be.false
      expect(createMemberStub.calledOnceWith(parsedEvent.args.to)).to.be.true
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
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

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalance as any)
      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: ITokenType.GovernanceERC20,
      } as any)
      sandbox.stub(Logger, 'verbose')

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('10')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()

      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler._incomingTransfer(parsedEvent, info as any, plugin as any)
      const memberTransaction = await Models.MemberTransaction.findOne({})

      expect(createMemberStub.calledOnceWith(parsedEvent.args.to)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getBalancesStub.calledOnce).to.be.true
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true
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
        sendMessageStub.calledOnceWith(EnumQueueName.daoMetrics, {
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
        network,
        transactionHash: '0xTransactionHash',
      } as ILogInfo

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      expect(result.from).to.equal(utils.zeroAddress)
      expect(result.to).to.equal(utils.zeroAddress)
      expect(getTransactionReceiptStub.calledOnceWith(info.transactionHash, info.network)).to.be.true
    })

    it('should return from and to delegates when matching delegator is found', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegatorAddress',
        },
      } as unknown as LogDescription

      const info = {
        network,
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
      expect(getTransactionReceiptStub.calledOnceWith(info.transactionHash, info.network)).to.be.true
      expect(findLogsByNameStub.calledOnceWith(txReceipt as any, IEventLogMember.DelegateChanged, GovernanceERC20.abi))
        .to.be.true
    })

    it('should return zero addresses if no matching delegator is found', async () => {
      const parsedEvent = {
        args: {
          delegate: '0xDelegatorAddress',
        },
      } as unknown as LogDescription

      const info = {
        network,
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
      expect(getTransactionReceiptStub.calledOnceWith(info.transactionHash, info.network)).to.be.true
      expect(findLogsByNameStub.calledOnceWith(txReceipt as any, IEventLogMember.DelegateChanged, GovernanceERC20.abi))
        .to.be.true
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
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xTokenAddress',
      }

      const plugin = {
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network,
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
        network,
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
