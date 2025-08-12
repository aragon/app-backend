import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { EnumQueueName, ITokenType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { LogDescription } from 'ethers'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import { TokenGovernance } from '@modules/memberGovernance/tokenGovernance'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { FakeToken } from '@test/mock/fakeToken'
import type Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import { expect } from 'chai'
import Web3Utils from '@helpers/web3Utils'

describe('GovernanceErc20Handler', () => {
  let sandbox: SinonSandbox
  let intervalTime: number
  let network: NetworksEnum
  let fakeToken: Token

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    network = NetworksEnum.polygonMainnet
    intervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0
    fakeToken = await Models.Token.create({
      ...FakeToken,
      type: ITokenType.ERC20,
      isGovernance: true,
    })
    sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').callsFake(async (_address: string) => 'test.eth')
  })

  afterEach(() => {
    sandbox.restore()
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = intervalTime
  })

  describe('delegateVotesChanged', () => {
    it('should handle if throw', async () => {
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

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(['plugin' as any])
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(new Error('fake error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.args[0][0]).to.equal('DelegateVotesChanged - error')
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
        network,
        blockNumber: 12345678,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0xTransactionHash',
        address: '0xTokenAddress',
        eventName: 'DelegateVotesChanged',
      }

      const findPluginStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(null)

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

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1' as any)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)
      expect(handlerResponse).to.be.undefined
      expect(getTokenBalanceAtBlockStub.notCalled).to.be.true
      expect(createMemberStub.notCalled).to.be.true
    })

    it('should handle token return null in delegateVotesChanged', async () => {
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

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(['plugin' as any])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      const createMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      expect(createMemberStub.notCalled).to.be.true
      expect(loggerErrorStub.calledWith('handleTransfer token not found' as any)).to.be.true
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

      const plugin = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          network,
          tokenAddress: '0xTokenAddress',
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          network,
          tokenAddress: '0xTokenAddress',
        },
      ]

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(plugin)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('2000')

      // Mock MemberGovernanceFactory
      const createMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves({} as any)

      // Mock governance instance
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify createBaseMember was called
      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(memberAddress, info.blockNumber)).to.be.true

      // Verify governance update was called
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(memberAddress, {
          votingPower: '2000',
          lastActivity: info.blockNumber,
        }),
      ).to.be.true

      // Verify plugin metrics were updated
      expect(mockGovernance.getOrCreatePluginMetrics.callCount).to.equal(plugin.length)
    })

    it('should handle outgoing delegateVotesChanged event and update plugin metrics', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
          previousBalance: '2000',
          newBalance: '1000',
          value: '500',
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
        tokenAddress: '0xTokenAddress',
      }

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('1000')

      // Mock MemberGovernanceFactory
      const createMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves({} as any)

      // Mock governance instance
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify createBaseMember was called with lastActivity
      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(memberAddress, info.blockNumber)).to.be.true

      // Verify governance update was called
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(memberAddress, {
          votingPower: '1000',
          lastActivity: info.blockNumber,
        }),
      ).to.be.true

      // Verify updatePluginMetrics was called for outgoing transfer
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: plugin.network,
          lastActivity: info.blockNumber,
        }),
      ).to.be.true

      // Verify message was sent
      expect(sendMessageStub.calledOnce).to.be.true
      expect(sendMessageStub.args[0]).to.deep.equal([
        EnumQueueName.daoMetrics,
        {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: plugin.network },
        },
      ])
    })

    it('should update plugin metrics for multiple plugins on outgoing delegation', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
          previousBalance: '2000',
          newBalance: '1000',
          value: '500',
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

      const plugin1 = {
        daoAddress: '0xDaoAddress1',
        address: '0xPluginAddress1',
        network,
        tokenAddress: '0xTokenAddress',
      }

      const plugin2 = {
        daoAddress: '0xDaoAddress2',
        address: '0xPluginAddress2',
        network,
        tokenAddress: '0xTokenAddress',
      }

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin1, plugin2])
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('1000')

      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves({} as any)

      // Mock governance instance
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify updatePluginMetrics was called for each plugin
      expect(mockGovernance.getOrCreatePluginMetrics.calledTwice).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.firstCall.calledWith({
          memberAddress,
          pluginAddress: plugin1.address,
          daoAddress: plugin1.daoAddress,
          network: plugin1.network,
          lastActivity: info.blockNumber,
        }),
      ).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.secondCall.calledWith({
          memberAddress,
          pluginAddress: plugin2.address,
          daoAddress: plugin2.daoAddress,
          network: plugin2.network,
          lastActivity: info.blockNumber,
        }),
      ).to.be.true

      // Verify dao metrics messages were sent for each unique DAO
      expect(sendMessageStub.calledTwice).to.be.true
      expect(
        sendMessageStub.firstCall.calledWith(EnumQueueName.daoMetrics, {
          id: plugin1.daoAddress,
          params: { address: plugin1.daoAddress, network: plugin1.network },
        }),
      ).to.be.true
      expect(
        sendMessageStub.secondCall.calledWith(EnumQueueName.daoMetrics, {
          id: plugin2.daoAddress,
          params: { address: plugin2.daoAddress, network: plugin2.network },
        }),
      ).to.be.true
    })

    it('should handle outgoing delegateVotesChanged event and remove member if voting power becomes zero', async () => {
      const memberAddress = '0xDelegateAddress'
      const parsedEvent = {
        args: {
          delegate: memberAddress,
          previousBalance: '1000',
          newBalance: '0',
          value: '0',
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
        tokenAddress: '0xTokenAddress',
      }

      // Create existing voting power member
      const existingTokenMember = await Models.TokenMember.create({
        memberAddress,
        tokenAddress: plugin.tokenAddress,
        network: plugin.network,
        votingPower: '1000',
        delegateReceivedCount: 0,
      })

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves({} as any)

      // Mock governance instance that will update the member to 0 voting power
      const mockGovernance = {
        update: sandbox.stub().callsFake(async (_memberAddress, params) => {
          // Update the existing TokenMember with the new voting power
          existingTokenMember.votingPower = params.votingPower
          await existingTokenMember.save()
          return existingTokenMember
        }),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify voting power was set to 0
      const tokenMember = await Models.TokenMember.findOne({
        memberAddress,
        tokenAddress: '0xTokenAddress',
        network,
      })
      expect(tokenMember).to.be.not.null
      expect(tokenMember.votingPower).to.be.eq('0')
    })
  })

  describe('delegateVotesChangedBatch', () => {
    it('should process multiple events and keep only latest per member', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '1' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember2', newBalance: '10' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '0' } } as any,
          info: { blockNumber: 2, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember3', newBalance: '12' } } as any,
          info: { blockNumber: 2, address: '0xtoken1', network } as any,
        },
      ]

      // Mock plugins
      const mockPlugins = [
        {
          address: '0xplugin1',
          daoAddress: '0xdao1',
          tokenAddress: '0xtoken1',
          network,
        },
      ]

      // Set up stubs
      const createMembersBatchStub = sandbox.stub(TokenGovernance, 'createMembersBatchNoTx').resolves(true)

      // Create mock governance instance for batch operations
      const mockGovernance = {
        updateTokenMemberVPBatchNoTx: sandbox.stub().resolves(true),
        updatePluginMetricsBatchNoTx: sandbox.stub().resolves(true),
      }
      sandbox.stub(TokenGovernance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      sandbox.stub(TokenGovernance.prototype, 'updatePluginMetricsBatchNoTx').resolves(true)
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Verify createMembersBatchNoTx was called with correct data
      expect(createMembersBatchStub.calledOnce).to.be.true
      const memberDataCall = createMembersBatchStub.getCall(0).args[0]
      expect(memberDataCall).to.have.lengthOf(3) // 3 unique members

      // Verify it keeps latest activity for each member
      const member1Data = memberDataCall.find((m: any) => m.memberAddress === '0xmember1')
      expect(member1Data!.lastActivity).to.equal(2) // Should use block 2, not block 1

      // Verify updateTokenMemberVPBatchNoTx was called
      expect((TokenGovernance.prototype.updateTokenMemberVPBatchNoTx as any).calledOnce).to.be.true
      const vpDataCall = (TokenGovernance.prototype.updateTokenMemberVPBatchNoTx as any).getCall(0).args[0]
      expect(vpDataCall).to.have.lengthOf(3) // 3 unique members

      // Verify it uses latest voting power for each member
      const member1VpData = vpDataCall.find((vp: any) => vp.memberAddress === '0xmember1')
      expect(member1VpData!.votingPower).to.equal('0') // Should use balance from block 2
      expect(member1VpData!.lastVPBlockNumber).to.equal(2)

      const member2VpData = vpDataCall.find((vp: any) => vp.memberAddress === '0xmember2')
      expect(member2VpData!.votingPower).to.equal('10')
      expect(member2VpData!.lastVPBlockNumber).to.equal(1)

      const member3VpData = vpDataCall.find((vp: any) => vp.memberAddress === '0xmember3')
      expect(member3VpData!.votingPower).to.equal('12')
      expect(member3VpData!.lastVPBlockNumber).to.equal(2)

      // Verify updatePluginMetricsBatchNoTx was called
      expect((TokenGovernance.prototype.updatePluginMetricsBatchNoTx as any).calledOnce).to.be.true
      const pluginMetricsCall = (TokenGovernance.prototype.updatePluginMetricsBatchNoTx as any).getCall(0).args[0]
      expect(pluginMetricsCall).to.have.lengthOf(3) // 3 members x 1 plugin
    })

    it('should skip zero addresses', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: utils.zeroAddress, newBalance: '100' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '50' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
      ]

      const createMembersBatchStub = sandbox.stub(TokenGovernance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(TokenGovernance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      sandbox.stub(TokenGovernance.prototype, 'updatePluginMetricsBatchNoTx').resolves(true)
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Should only process 1 member (skipping zero address)
      expect(createMembersBatchStub.calledOnce).to.be.true
      const memberDataCall = createMembersBatchStub.getCall(0).args[0]
      expect(memberDataCall).to.have.lengthOf(1)
      expect(memberDataCall[0].memberAddress).to.equal('0xmember1')

      expect((TokenGovernance.prototype.updateTokenMemberVPBatchNoTx as any).calledOnce).to.be.true
      const vpDataCall = (TokenGovernance.prototype.updateTokenMemberVPBatchNoTx as any).getCall(0).args[0]
      expect(vpDataCall).to.have.lengthOf(1)
    })

    it('should handle empty events array', async () => {
      const createMembersBatchStub = sandbox.stub(TokenGovernance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(TokenGovernance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)

      await GovernanceErc20Handler.delegateVotesChangedBatch([])

      expect(createMembersBatchStub.notCalled).to.be.true
      expect((TokenGovernance.prototype.updateTokenMemberVPBatchNoTx as any).notCalled).to.be.true
    })

    it('should handle multiple plugins for same token', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '100' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
      ]

      const mockPlugins = [
        { address: '0xplugin1', daoAddress: '0xdao1', tokenAddress: '0xtoken1', network },
        { address: '0xplugin2', daoAddress: '0xdao1', tokenAddress: '0xtoken1', network },
        { address: '0xplugin3', daoAddress: '0xdao2', tokenAddress: '0xtoken1', network },
      ]

      sandbox.stub(TokenGovernance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(TokenGovernance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      const updatePluginMetricsBatchStub = sandbox
        .stub(TokenGovernance.prototype, 'updatePluginMetricsBatchNoTx')
        .resolves(true)
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Should create metrics for each plugin
      expect((TokenGovernance.prototype.updatePluginMetricsBatchNoTx as any).calledOnce).to.be.true
      const pluginMetricsCall = (TokenGovernance.prototype.updatePluginMetricsBatchNoTx as any).getCall(0).args[0]
      expect(pluginMetricsCall).to.have.lengthOf(3) // 1 member x 3 plugins

      // Should send messages for unique DAOs
      expect(sendMessageStub.callCount).to.equal(2) // 2 unique DAOs
    })

    it('should handle errors gracefully and fallback to individual processing', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '100' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
      ]

      const error = new Error('Database error')
      // Make the NoTx batch methods fail
      sandbox.stub(TokenGovernance, 'createMembersBatchNoTx').rejects(error)
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      // Stub the fallback methods that will be called
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Batch transaction failed, falling back to individual processing' as any)).to.be
        .true
    })
  })
})
