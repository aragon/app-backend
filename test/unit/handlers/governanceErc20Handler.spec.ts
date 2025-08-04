import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { EnumQueueName, ITokenType, ITransferSide, ITransferType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { LogDescription } from 'ethers'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'
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
      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('fake error'))

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

    it('should return if existing log is found', async () => {
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

      const plugin = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: '0xTokenAddress',
          network,
        },
        {
          daoAddress: '0xDaoAddress1',
          address: '0xPluginAddress1',
          network,
          tokenAddress: '0xTokenAddress',
        },
      ] as any

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(plugin)
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves({
        memberVotingPower: '2000',
        memberAddress: fakeLog.args.delegate,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(handlerResponse).to.be.undefined
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
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')
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
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('2000')
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves({} as any)
      const updateVotingPowerStub = sandbox.stub(ProxyMember, 'updateVotingPower').resolves()
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves({
        memberAddress,
        tokenAddress: '0xTokenAddress',
        network,
        votingPower: '2000',
        delegateReceivedCount: 0,
      } as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify the member transaction was created in the database
      const memberTransaction = await Models.MemberTransaction.findOne({
        transactionHash: info.transactionHash,
        address: memberAddress,
      })

      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.incoming)
      expect(memberTransaction.memberVotingPower).to.be.eq('2000')
      expect(memberTransaction.blockNumber).to.be.eq(info.blockNumber)

      // Verify createMember was called
      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(memberAddress, undefined)).to.be.true

      // Verify updateVotingPower was called
      expect(updateVotingPowerStub.calledOnce).to.be.true
      expect(
        updateVotingPowerStub.calledWith({
          memberAddress,
          tokenAddress: info.address,
          votingPower: '2000',
          network: info.network,
          lastVPBlockNumber: info.blockNumber,
        }),
      ).to.be.true
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
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('1000')
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves({} as any)
      const updateVotingPowerStub = sandbox.stub(ProxyMember, 'updateVotingPower').resolves()
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves({
        memberAddress,
        tokenAddress: '0xTokenAddress',
        network,
        votingPower: '1000',
        delegateReceivedCount: 0,
      } as any)
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({
        transactionHash: info.transactionHash,
        address: memberAddress,
      })

      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberVotingPower).to.be.eq('1000')
      expect(memberTransaction.amount).to.be.eq('500')

      // Verify createMember was called with lastActivity
      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(memberAddress, info.blockNumber)).to.be.true

      // Verify updateVotingPower was called
      expect(updateVotingPowerStub.calledOnce).to.be.true
      expect(
        updateVotingPowerStub.calledWith({
          memberAddress,
          tokenAddress: info.address,
          votingPower: '1000',
          network: info.network,
          lastVPBlockNumber: info.blockNumber,
        }),
      ).to.be.true

      // Verify updatePluginMetrics was called for outgoing transfer
      expect(updatePluginMetricsStub.calledOnce).to.be.true
      expect(
        updatePluginMetricsStub.calledWith({
          memberAddress,
          pluginAddress: plugin.address,
          network,
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
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'createMember').resolves({} as any)
      sandbox.stub(ProxyMember, 'updateVotingPower').resolves()
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves({
        memberAddress,
        tokenAddress: '0xTokenAddress',
        network,
        votingPower: '1000',
        delegateReceivedCount: 0,
      } as any)
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify updatePluginMetrics was called for each plugin
      expect(updatePluginMetricsStub.calledTwice).to.be.true
      expect(
        updatePluginMetricsStub.firstCall.calledWith({
          memberAddress,
          pluginAddress: plugin1.address,
          network,
          lastActivity: info.blockNumber,
        }),
      ).to.be.true
      expect(
        updatePluginMetricsStub.secondCall.calledWith({
          memberAddress,
          pluginAddress: plugin2.address,
          network,
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
      const existingVpMember = await Models.VpMember.create({
        memberAddress,
        tokenAddress: plugin.tokenAddress,
        network: plugin.network,
        votingPower: '1000',
        delegateReceivedCount: 0,
      })

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'createMember').resolves({} as any)
      const updateVotingPowerStub = sandbox.stub(ProxyMember, 'updateVotingPower').callsFake(async params => {
        // Update the existing VpMember with the new voting power
        existingVpMember.votingPower = params.votingPower
        await existingVpMember.save()
        return existingVpMember
      })
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(existingVpMember as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      // Stub removePluginMember
      sandbox.stub(ProxyMember, 'removePluginMember').resolves(true)

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({
        transactionHash: info.transactionHash,
        address: memberAddress,
      })

      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberVotingPower).to.be.eq('0')

      // Verify voting power was set to 0
      const vpMember = await Models.VpMember.findOne({
        memberAddress,
        tokenAddress: '0xTokenAddress',
        network,
      })
      expect(vpMember).to.be.not.null
      expect(vpMember.votingPower).to.be.eq('0')
    })
  })
})
