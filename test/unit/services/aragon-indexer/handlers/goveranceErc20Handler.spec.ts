import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import { IMetricAction, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@services/aragon-indexer/handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { AggregatorDaoMetrics } from '@indexer/aggregator/daoMetrics'

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

    it('should return if already existing logs for delegate votes changed event', async () => {
      const fakeLog = {
        args: {
          delegate: '0x123',
          previousBalance: 1232,
          newBalance: 123213,
        },
      }

      const logInfo = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12313123,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x123213213213213',
        address: '0x12ba12bac',
        eventName: 'DelegateVotesChanged',
      }

      const saveAndGetMemberStub = sandbox.stub(ProxyMember, 'saveAndGetMember').resolves({
        address: '0x123',
      } as any)

      const existingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').returns(true)

      const response = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)
      expect(response).to.be.undefined
      expect(saveAndGetMemberStub.calledOnce).to.be.true
      expect(existingLogStub.calledOnce).to.be.true
    })

    it('should save the delegate votes changed event', async () => {
      const fakeLog = {
        args: {
          delegate: '0x123',
          previousBalance: 1232,
          newBalance: 123213,
        },
      }

      const logInfo = {
        network: NetworksEnum.polygonMainnet,
        blockNumber: 12313123,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x123213213213213',
        address: '0x12ba12bac',
        eventName: 'DelegateVotesChanged',
      }
      const loggerStub = sandbox.stub(Logger, 'verbose')
      const saveAndGetMemberStub = sandbox.stub(ProxyMember, 'saveAndGetMember').resolves({
        address: '0x123',
      } as any)
      const existingLogSpy = sandbox.spy(Models.MemberTransaction, 'findExistingLog')

      const _findDelegatorsFromReceiptStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({
          from: '0x123',
          to: '0x123',
        })

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1000')

      const findActivePluginStub = sandbox.stub(Models.Plugin, 'findActivePluginByTokenAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.polygonMainnet,
      } as any)

      const updateMemberMetricsStub = sandbox.stub(ProxyMember, 'updateMemberMetrics').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      const aggregatorDaoMetricsStub = sandbox.stub(AggregatorDaoMetrics, 'start').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(saveAndGetMemberStub.calledOnce).to.be.true
      expect(saveAndGetMemberStub.calledWith(fakeLog.args.delegate)).to.be.true

      expect(existingLogSpy.calledOnce).to.be.true
      expect(
        existingLogSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          side: 'incoming',
          type: 'delegate',
          address: fakeLog.args.delegate,
        }),
      ).to.be.true

      expect(_findDelegatorsFromReceiptStub.calledOnce).to.be.true

      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledWith(logInfo.blockNumber, logInfo.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(
        getTokenBalanceAtBlockStub.calledWith({
          address: fakeLog.args.delegate,
          blockNumber: logInfo.blockNumber,
          tokenAddress: logInfo.address,
          network: logInfo.network,
        }),
      ).to.be.true
      expect(findActivePluginStub.calledOnce).to.be.true
      expect(findActivePluginStub.calledWith(logInfo.address, logInfo.network)).to.be.true
      expect(updateMemberMetricsStub.calledOnce).to.be.true
      expect(
        updateMemberMetricsStub.calledWith(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress: fakeLog.args.delegate,
          pluginAddress: '0xPluginAddress',
          network: logInfo.network,
        }),
      ).to.be.true

      expect(addToDaoStub.calledOnce).to.be.true
      expect(
        addToDaoStub.calledWith({
          memberAddress: fakeLog.args.delegate,
          pluginAddress: '0xPluginAddress',
          daoAddress: '0xDaoAddress',
          network: logInfo.network,
        }),
      ).to.be.true

      expect(removeFromDaoStub.calledOnce).to.be.false
      expect(loggerStub.calledTwice).to.be.true
      expect(aggregatorDaoMetricsStub.calledOnce).to.be.true
    })
  })
})
