import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
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
      const _handleDaoMemberShipStub = sandbox.spy(GovernanceErc20Handler, '_handleDaoMemberShip')

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.notCalled).to.be.true
      expect(_handleDaoMemberShipStub.notCalled).to.be.true
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
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(null)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify the member was created
      const member = await Models.Member.findOne({ address: memberAddress })
      expect(member).to.be.not.null

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
      expect(memberTransaction.blockTimestamp).to.be.eq(1630425600)

      // Verify the member balance was updated
      const memberBalance = await Models.MemberBalance.findOne({ address: memberAddress })
      expect(memberBalance).to.be.not.null
      expect(memberBalance.votingPower).to.be.eq('2000')

      // Verify member was added to DAOs
      const daoMappings = await Models.DaoMemberMapping.find({ memberAddress })
      expect(daoMappings.length).to.be.eq(2)
    })

    it('should handle outgoing delegateVotesChanged event and add member to DAO', async () => {
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
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(null)
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

      // Verify member was added to DAO (since they still have voting power > 0)
      const daoMappings = await Models.DaoMemberMapping.find({ memberAddress })
      expect(daoMappings.length).to.be.eq(1)

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

      // Create existing DAO member mapping
      const existingMapping = await Models.DaoMemberMapping.create({
        memberAddress,
        daoAddress: plugin.daoAddress,
        network: plugin.network,
        pluginAddress: plugin.address,
        tokenAddress: plugin.tokenAddress,
      })

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(existingMapping)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      // Stub removePluginMember to actually remove the document
      sandbox.stub(ProxyMember, 'removePluginMember').callsFake(async params => {
        return await Models.DaoMemberMapping.deleteOne({
          memberAddress: params.memberAddress,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          tokenAddress: params.tokenAddress,
        })
      })

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      const memberTransaction = await Models.MemberTransaction.findOne({
        transactionHash: info.transactionHash,
        address: memberAddress,
      })

      expect(memberTransaction).to.be.not.null
      expect(memberTransaction.type).to.be.eq(ITransferType.delegate)
      expect(memberTransaction.side).to.be.eq(ITransferSide.outgoing)
      expect(memberTransaction.memberVotingPower).to.be.eq('0')

      // Verify member was removed from DAO (since voting power and balance are 0)
      const remainingMappings = await Models.DaoMemberMapping.find({ memberAddress })
      expect(remainingMappings.length).to.be.eq(0)
    })
  })

  describe('_handleDaoMemberShip', () => {
    it('should add member to DAO when requirements are met and not a member', async () => {
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
      const removePluginMemberStub = sandbox.stub(ProxyMember, 'removePluginMember').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = {
        address: '0xMember',
        memberVotingPower: '2000',
      }

      const plugins = [
        {
          daoAddress: '0xDao1',
          network,
          address: '0xPlugin1',
          tokenAddress: '0xToken1',
        },
        {
          daoAddress: '0xDao2',
          network,
          address: '0xPlugin2',
          tokenAddress: '0xToken1',
        },
      ] as any

      const info = {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any

      uniqueValuesStub.returns(['0xDao1', '0xDao2'])
      isMemberOfDaoStub.resolves(null)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, false)

      // Verify member was added to both DAOs
      expect(isMemberOfDaoStub.callCount).to.equal(2)
      expect(addPluginMemberStub.callCount).to.equal(2)
      expect(removePluginMemberStub.notCalled).to.be.true

      // Verify the correct parameters were passed
      expect(addPluginMemberStub.firstCall.args[0]).to.deep.equal({
        memberAddress: '0xMember',
        daoAddress: '0xDao1',
        network,
        pluginAddress: '0xPlugin1',
        tokenAddress: '0xToken1',
      })

      expect(addPluginMemberStub.secondCall.args[0]).to.deep.equal({
        memberAddress: '0xMember',
        daoAddress: '0xDao2',
        network,
        pluginAddress: '0xPlugin2',
        tokenAddress: '0xToken1',
      })

      // Verify RabbitMQ messages were sent for unique DAOs
      expect(sendMessageStub.callCount).to.equal(2)
      expect(sendMessageStub.firstCall.args).to.deep.equal([
        EnumQueueName.daoMetrics,
        {
          id: '0xDao1',
          params: { address: '0xDao1', network },
        },
      ])
    })

    it('should remove member from DAO when requirements are not met and already a member', async () => {
      const mockDaoMapping = {
        removeSelf: sandbox.stub().resolves(),
      }

      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
      const removePluginMemberStub = sandbox.stub(ProxyMember, 'removePluginMember').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = {
        address: '0xMember',
        memberVotingPower: '0',
      }

      const plugins = [
        {
          daoAddress: '0xDao1',
          network,
          address: '0xPlugin1',
          tokenAddress: '0xToken1',
        },
      ] as any

      const info = {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any

      uniqueValuesStub.returns(['0xDao1'])
      isMemberOfDaoStub.resolves(mockDaoMapping)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, false)

      expect(isMemberOfDaoStub.callCount).to.equal(1)
      expect(removePluginMemberStub.callCount).to.equal(1)
      expect(addPluginMemberStub.notCalled).to.be.true

      expect(removePluginMemberStub.firstCall.args[0]).to.deep.equal({
        memberAddress: '0xMember',
        daoAddress: '0xDao1',
        network,
        pluginAddress: '0xPlugin1',
        tokenAddress: '0xToken1',
      })

      expect(sendMessageStub.callCount).to.equal(1)
    })

    it('should not add or remove member when already a member with requirements met', async () => {
      const mockDaoMapping = {
        removeSelf: sandbox.stub().resolves(),
      }

      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
      const removePluginMemberStub = sandbox.stub(ProxyMember, 'removePluginMember').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = {
        address: '0xMember',
        memberVotingPower: '2000',
      }

      const plugins = [
        {
          daoAddress: '0xDao1',
          network,
          address: '0xPlugin1',
          tokenAddress: '0xToken1',
        },
      ] as any

      const info = {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any

      uniqueValuesStub.returns(['0xDao1'])
      isMemberOfDaoStub.resolves(mockDaoMapping)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, false)

      expect(isMemberOfDaoStub.callCount).to.equal(1)
      expect(addPluginMemberStub.notCalled).to.be.true
      expect(removePluginMemberStub.notCalled).to.be.true

      // RabbitMQ message should still be sent
      expect(sendMessageStub.callCount).to.equal(1)
    })

    it('should not send RabbitMQ messages when isHistorical is true', async () => {
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = {
        address: '0xMember',
        memberVotingPower: '2000',
      }

      const plugins = [
        {
          daoAddress: '0xDao1',
          network,
          address: '0xPlugin1',
          tokenAddress: '0xToken1',
        },
      ] as any

      const info = {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any

      uniqueValuesStub.returns(['0xDao1'])
      isMemberOfDaoStub.resolves(null)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, true)

      expect(addPluginMemberStub.callCount).to.equal(1)
      expect(sendMessageStub.notCalled).to.be.true
    })

    it('should handle member with only voting power (no balance)', async () => {
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = {
        address: '0xMember',
        memberVotingPower: '1000',
      }

      const plugins = [
        {
          daoAddress: '0xDao1',
          network,
          address: '0xPlugin1',
          tokenAddress: '0xToken1',
        },
      ] as any

      const info = {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any

      uniqueValuesStub.returns(['0xDao1'])
      isMemberOfDaoStub.resolves(null)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, false)

      expect(addPluginMemberStub.callCount).to.equal(1)
      expect(sendMessageStub.callCount).to.equal(1)
    })
  })
})
