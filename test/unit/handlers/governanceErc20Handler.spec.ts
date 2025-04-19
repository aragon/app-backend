import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { EnumQueueName, ILogInfo, ITokenType, ITransferSide, ITransferType, NetworksEnum } from '@types'
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
import Logger from '@logger'
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

  describe('_handleTransfer', () => {
    let getBlockTimestampStub: SinonStub
    let saveAndGetTokenStub: SinonStub
    let rabbitMqStub: SinonStub

    beforeEach(() => {
      getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(fakeToken)
      rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    })

    it('should handle incoming ERC20 transfer event and add member to DAO', async () => {
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
        address: FakeToken.address,
      }

      const plugins = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: FakeToken.address,
          network,
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          tokenAddress: FakeToken.address,
          network,
        },
      ]

      const createMemberSpy = sandbox.spy(ProxyMember, 'createMember')
      const getBalanceSpy = sandbox.spy(ProxyMember, 'getBalances')
      const addMemberToDaoSpy = sandbox.spy(ProxyMember, 'addToDao')

      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('2000')
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.incoming, plugins as any)

      expect(createMemberSpy.calledWith(parsedEvent.args.to)).to.be.true
      const members = await Models.Member.find({})
      expect(members.length).to.be.eq(1)
      expect(members[0].address).to.be.eq(parsedEvent.args.to)

      expect(
        findExistingLogStub.calledOnceWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          address: '0xTo',
        }),
      ).to.be.true

      expect(
        getBalanceSpy.calledOnceWith({
          address: parsedEvent.args.to,
          tokenAddress: info.address,
          network: info.network,
        }),
      ).to.be.true

      const memberBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })
      expect(memberBalance).to.be.not.null

      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true

      expect(saveAndGetTokenStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(getPastVotesStub.calledOnce).to.be.true
      expect(
        addMemberToDaoSpy.calledWith({
          memberAddress: parsedEvent.args.to,
          daoAddress: plugins[0].daoAddress,
          pluginAddress: plugins[0].address,
          network: info.network,
          tokenAddress: info.address,
        }),
      ).to.be.true

      //wait for internal db session to finish
      await utils.wait(1000)
      expect(addMemberToDaoSpy.calledTwice).to.be.true

      const addToDao = await Models.DaoMemberMapping.find({
        memberAddress: parsedEvent.args.to,
      })

      const tokenBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })

      expect(tokenBalance.amount).to.be.eq('1000')

      expect(addToDao.length).to.be.eq(2)
      expect(addToDao.find((w: any) => w.daoAddress === plugins[0].daoAddress)).to.exist
      expect(addToDao.find((w: any) => w.pluginAddress === plugins[0].address)).to.exist

      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][1].id).to.be.eq(plugins[0].daoAddress)
      expect(rabbitMqStub.args[1][1].id).to.be.eq(plugins[1].daoAddress)
    })

    it('should handle outgoing ERC20 transfer event and add member to DAO', async () => {
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
        address: FakeToken.address,
      }

      const plugins = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: FakeToken.address,
          network,
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          tokenAddress: '0xTokenAddress2',
          network,
        },
      ]

      const createMemberSpy = sandbox.spy(ProxyMember, 'createMember')
      const getBalanceSpy = sandbox.spy(ProxyMember, 'getBalances')
      const removeFromDao = sandbox.spy(ProxyMember, 'removeFromDao')
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves({
        removeSelf: sandbox.stub().resolves({ id: 123 }),
      })

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.outgoing, plugins as any)

      expect(createMemberSpy.calledWith(parsedEvent.args.from)).to.be.true
      const members = await Models.Member.find({})
      expect(members.length).to.be.eq(1)
      expect(members[0].address).to.be.eq(parsedEvent.args.from)

      expect(
        findExistingLogStub.calledOnceWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          address: '0xFrom',
        }),
      ).to.be.true

      expect(
        getBalanceSpy.calledOnceWith({
          address: parsedEvent.args.from,
          tokenAddress: info.address,
          network: info.network,
        }),
      ).to.be.true

      const memberBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.from,
      })
      expect(memberBalance).to.be.not.null

      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true

      expect(saveAndGetTokenStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(getPastVotesStub.calledOnce).to.be.true
      expect(
        removeFromDao.calledWith({
          memberAddress: parsedEvent.args.from,
          daoAddress: plugins[0].daoAddress,
          pluginAddress: plugins[0].address,
          network: info.network,
          tokenAddress: info.address,
        }),
      ).to.be.true

      expect(removeFromDao.calledTwice).to.be.true

      const tokenBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.from,
      })

      expect(isMemberOfDaoStub.called).to.be.true
      expect(tokenBalance.amount).to.be.eq('0')

      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][1].id).to.be.eq(plugins[0].daoAddress)
      expect(rabbitMqStub.args[1][1].id).to.be.eq(plugins[1].daoAddress)
    })

    it('should handle outgoing ER721 transfer event and add member to DAO', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          tokenId: 123,
        },
      } as unknown as LogDescription

      await fakeToken.update({
        type: ITokenType.ERC721,
      })

      const info = {
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: FakeToken.address,
      }

      const plugins = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: FakeToken.address,
          network,
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          tokenAddress: '0xTokenAddress2',
          network,
        },
      ]

      const createMemberSpy = sandbox.spy(ProxyMember, 'createMember')
      const getBalanceSpy = sandbox.spy(ProxyMember, 'getBalances')
      const removeFromDao = sandbox.spy(ProxyMember, 'removeFromDao')
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves({
        removeSelf: sandbox.stub().resolves(123),
      })

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.outgoing, plugins as any)

      expect(createMemberSpy.calledWith(parsedEvent.args.from)).to.be.true
      const members = await Models.Member.find({})
      expect(members.length).to.be.eq(1)
      expect(members[0].address).to.be.eq(parsedEvent.args.from)

      expect(
        findExistingLogStub.calledOnceWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          address: '0xFrom',
        }),
      ).to.be.true

      expect(
        getBalanceSpy.calledOnceWith({
          address: parsedEvent.args.from,
          tokenAddress: info.address,
          network: info.network,
        }),
      ).to.be.true

      const memberBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.from,
      })
      expect(memberBalance).to.be.not.null

      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true

      expect(saveAndGetTokenStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(
        removeFromDao.calledWith({
          memberAddress: parsedEvent.args.from,
          daoAddress: plugins[0].daoAddress,
          pluginAddress: plugins[0].address,
          network: info.network,
          tokenAddress: info.address,
        }),
      ).to.be.true

      const memberTransaction = await Models.MemberTransaction.find({})
      expect(memberTransaction.length).to.be.eq(1)
      expect(memberTransaction[0].tokenId).to.be.eq(parsedEvent.args.tokenId)

      expect(removeFromDao.calledTwice).to.be.true

      const tokenBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.from,
      })

      expect(tokenBalance.amount).to.be.eq('0')
      expect(isMemberOfDaoStub.called).to.be.true
      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][1].id).to.be.eq(plugins[0].daoAddress)
      expect(rabbitMqStub.args[1][1].id).to.be.eq(plugins[1].daoAddress)
    })

    it('should handle incoming ER721 transfer event and add member to DAO', async () => {
      const parsedEvent = {
        args: {
          from: '0xFrom',
          to: '0xTo',
          tokenId: 123,
        },
      } as unknown as LogDescription

      await fakeToken.update({
        type: ITokenType.ERC721,
      })

      const info = {
        network,
        blockNumber: 12345678,
        transactionHash: '0xTransactionHash',
        transactionIndex: 1,
        logIndex: 1,
        address: FakeToken.address,
      }

      const plugins = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: FakeToken.address,
          network,
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          tokenAddress: FakeToken.address,
          network,
        },
      ]

      const createMemberSpy = sandbox.spy(ProxyMember, 'createMember')
      const getBalanceSpy = sandbox.spy(ProxyMember, 'getBalances')
      const addToDao = sandbox.spy(ProxyMember, 'addToDao')
      const removeFromDao = sandbox.spy(ProxyMember, 'removeFromDao')
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('12')
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.incoming, plugins as any)

      expect(createMemberSpy.calledWith(parsedEvent.args.to)).to.be.true
      const members = await Models.Member.find({})
      expect(members.length).to.be.eq(1)
      expect(members[0].address).to.be.eq(parsedEvent.args.to)

      expect(
        findExistingLogStub.calledOnceWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          address: '0xTo',
        }),
      ).to.be.true

      expect(
        getBalanceSpy.calledOnceWith({
          address: parsedEvent.args.to,
          tokenAddress: info.address,
          network: info.network,
        }),
      ).to.be.true

      const memberBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })
      expect(memberBalance).to.be.not.null

      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true

      expect(saveAndGetTokenStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(
        addToDao.calledWith({
          memberAddress: parsedEvent.args.to,
          daoAddress: plugins[0].daoAddress,
          pluginAddress: plugins[0].address,
          network: info.network,
          tokenAddress: info.address,
        }),
      ).to.be.true
      expect(removeFromDao.calledOnce).to.be.false

      const memberTransaction = await Models.MemberTransaction.find({})
      expect(memberTransaction.length).to.be.eq(1)
      expect(memberTransaction[0].tokenId).to.be.eq(parsedEvent.args.tokenId)

      expect(addToDao.calledTwice).to.be.true

      const tokenBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })

      expect(tokenBalance.amount).to.be.eq('1')
      expect(tokenBalance.tokenIds.length).to.be.eq(1)
      expect(tokenBalance.tokenIds[0]).to.be.eq(parsedEvent.args.tokenId)

      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][1].id).to.be.eq(plugins[0].daoAddress)
      expect(rabbitMqStub.args[1][1].id).to.be.eq(plugins[1].daoAddress)
    })

    it('should handle token return null', async () => {
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
        address: FakeToken.address,
      }

      const plugins = [
        {
          daoAddress: '0xDaoAddress',
          address: '0xPluginAddress',
          tokenAddress: FakeToken.address,
          network,
        },
        {
          daoAddress: '0xDaoAddress2',
          address: '0xPluginAddress2',
          tokenAddress: FakeToken.address,
          network,
        },
      ]

      saveAndGetTokenStub.resolves(null)
      const createMemberSpy = sandbox.spy(ProxyMember, 'createMember')
      const getBalanceSpy = sandbox.spy(ProxyMember, 'getBalances')
      const addMemberToDaoSpy = sandbox.spy(ProxyMember, 'addToDao')

      const stubLogger = sandbox.stub(logger, 'error')
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('2000')
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.incoming, plugins as any)

      expect(createMemberSpy.calledWith(parsedEvent.args.to)).to.be.true
      const members = await Models.Member.find({})
      expect(members.length).to.be.eq(1)
      expect(members[0].address).to.be.eq(parsedEvent.args.to)

      expect(
        findExistingLogStub.calledOnceWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          address: '0xTo',
        }),
      ).to.be.true

      expect(
        getBalanceSpy.calledOnceWith({
          address: parsedEvent.args.to,
          tokenAddress: info.address,
          network: info.network,
        }),
      ).to.be.true

      const memberBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })
      expect(memberBalance).to.be.not.null

      expect(getBlockTimestampStub.calledOnceWith(info.blockNumber, info.network)).to.be.true

      expect(saveAndGetTokenStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(getPastVotesStub.notCalled).to.be.true
      expect(addMemberToDaoSpy.notCalled).to.be.true

      //wait for internal db session to finish
      await utils.wait(1000)
      expect(addMemberToDaoSpy.notCalled).to.be.true

      const tokenBalance = await Models.MemberBalance.findOne({
        address: parsedEvent.args.to,
      })

      expect(tokenBalance.amount).to.be.eq('0')

      expect(stubLogger.calledWith('handleTransfer token not found' as any)).to.be.true
      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][1].id).to.be.eq(plugins[0].daoAddress)
      expect(rabbitMqStub.args[1][1].id).to.be.eq(plugins[1].daoAddress)
    })

    it('should handle if the existing log is found', async () => {
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
        tokenAddress: '0xTokenAddress',
      }

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.from } as any)

      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves({
        memberBalance: 0,
        memberVotingPower: 0,
        address: parsedEvent.args.from,
      })

      const removeStub = sandbox.stub(ProxyMember, 'removeFromDao')
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)

      const handlerResponse = await GovernanceErc20Handler._handleTransfer(
        parsedEvent,
        info as any,
        ITransferSide.outgoing,
        [plugin] as any,
      )

      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.calledOnceWith(parsedEvent.args.from)).to.be.true
      expect(removeStub.calledOnce).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should handle if throw', async () => {
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

      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('fake error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await GovernanceErc20Handler._handleTransfer(parsedEvent, info as any, ITransferSide.incoming, [plugin] as any)

      expect(loggerErrorStub.calledOnceWith('Transfer - incoming transfer error' as any)).to.be.true
    })
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

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(['plugin' as any])
      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('fake error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      expect(loggerErrorStub.calledOnceWith('DelegateVotesChanged - error' as any)).to.be.true
    })

    it('should return if the delegators are not found ', async () => {
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
      sandbox.stub(ProxyMember, 'createMember').resolves({ address: parsedEvent.args.delegate } as any)
      sandbox.stub(ProxyMember, 'getBalances').resolves({ amount: '213', updateVotingPower: sandbox.stub() } as any)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('213')
      sandbox.stub(GovernanceErc20Handler, '_handleDaoMemberShip')
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        delegator: utils.zeroAddress,
        from: utils.zeroAddress,
        to: utils.zeroAddress,
      })

      const getTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)
      expect(getTimestampStub.calledOnce).to.be.false
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

      const errorStub = sandbox.stub(Logger, 'warn')
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1' as any)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: utils.zeroAddress,
        to: utils.zeroAddress,
        delegator: utils.zeroAddress,
      })

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(errorStub.calledWith('Skip from and to address' as any)).to.be.true
      expect(handlerResponse).to.be.undefined
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(createMemberStub.calledTwice).to.be.true
    })

    it('should handle if existing log is found', async () => {
      const fakeLog = {
        args: {
          delegate: '0xDelegateAddress',
          previousBalance: '1000',
          newBalance: '2000',
        },
      }

      sandbox.stub(logger, 'warn')

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

      const existingPlugintub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(plugin)

      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: fakeLog.args.delegate } as any)

      const _handleDaoMemberShipStub = sandbox.spy(GovernanceErc20Handler, '_handleDaoMemberShip')
      const isMemberOfDaoStub = sandbox
        .stub(ProxyMember, 'isMemberOfDao')
        .onFirstCall()
        .resolves(true)
        .onSecondCall()
        .resolves(false)
      const addMemberToDaoStub = sandbox.stub(ProxyMember, 'addToDao')
      const existingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves({
        memberBalance: '2000',
        memberVotingPower: '2000',
        memberAddress: fakeLog.args.delegate,
      })
      const rabbitMqHandlerStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(_handleDaoMemberShipStub.calledOnce).to.be.true
      expect(
        _handleDaoMemberShipStub.calledWith(
          {
            memberBalance: '2000',
            memberVotingPower: '2000',
            memberAddress: fakeLog.args.delegate,
          },
          ITokenType.ERC20,
          true,
          plugin,
          logInfo,
        ),
      ).to.be.true

      expect(isMemberOfDaoStub.calledTwice).to.be.true
      expect(isMemberOfDaoStub.args[0][0].daoAddress).to.be.eq('0xDaoAddress')
      expect(isMemberOfDaoStub.args[1][0].daoAddress).to.be.eq('0xDaoAddress1')
      expect(handlerResponse).to.be.undefined
      expect(createMemberStub.calledOnce).to.be.true
      expect(existingLogStub.calledOnce).to.be.true
      expect(existingPlugintub.calledOnce).to.be.true
      expect(rabbitMqHandlerStub.calledTwice).to.be.true
      expect(rabbitMqHandlerStub.args[0][1].id).to.be.eq('0xDaoAddress')
      expect(rabbitMqHandlerStub.args[1][1].id).to.be.eq('0xDaoAddress1')
      expect(addMemberToDaoStub.calledOnce).to.be.true
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

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(plugin)
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: memberAddress, delegator: '0xFrom' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const handleDaoMemberShipStub = sandbox.stub(GovernanceErc20Handler, '_handleDaoMemberShip').resolves()

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
      expect(handleDaoMemberShipStub.calledOnce).to.be.true
      expect(updateActivityStub.calledTwice).to.be.true
      const calledAddresses = updateActivityStub.args.map(callArgs => callArgs[0].pluginAddress)
      expect(calledAddresses).to.include(plugin[0].address)
      expect(calledAddresses).to.include(plugin[1].address)
      expect(
        handleDaoMemberShipStub.calledOnceWith({
          address: parsedEvent.args.delegate,
          memberBalance: '1500',
          memberVotingPower: '2000',
        }),
      ).to.be.true
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
        tokenAddress: '0xTokenAddress',
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: '0xTo', delegator: utils.zeroAddress })
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
          tokenAddress: info.address,
        }),
      ).to.be.true
      expect(sendMessageStub.called).to.be.true
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
        tokenAddress: '0xTokenAddress',
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)

      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)

      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: memberAddress, to: '0xTo', delegator: memberAddress })
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
          tokenAddress: info.address,
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
        tokenAddress: '0xTokenAddress',
      }

      const findByAddressStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const createMemberStub = sandbox
        .stub(ProxyMember, 'createMember')
        .resolves({ address: parsedEvent.args.delegate } as any)
      const findExistingLogStub = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(false)
      const getBalancesStub = sandbox.stub(ProxyMember, 'getBalances').resolves({
        updateVotingPower: sandbox.stub().resolves({ id: 'logDbId' }),
      } as any)
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const findDelegatorsStub = sandbox
        .stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt')
        .resolves({ from: '0xFrom', to: '0xTo', delegator: '0xFrom' })
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      const memberTransactionCreateStub = sandbox.spy(Models.MemberTransaction, 'create')

      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
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
          tokenAddress: info.address,
        }),
      ).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error cannot detect delegation side' as any)).to.be.true
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

    describe('delegate test', () => {
      it('should return the from and to case 1', async () => {
        const parsedEvent = {
          args: {
            delegate: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
          },
        } as unknown as LogDescription

        const info = {
          network,
          transactionIndex: 1,
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
              delegator: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
              fromDelegate: '0x2dB75d8404144CD5918815A44B8ac3f4DB2a7FAf',
              toDelegate: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
            },
          },
          txLog: txReceipt.logs[0],
        }

        sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
        sandbox.stub(Web3Utils, 'findLogsByName').returns([delegateChangedLog as any])

        const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

        expect(result.from).to.equal('0x2dB75d8404144CD5918815A44B8ac3f4DB2a7FAf')
        expect(result.to).to.equal('0xc1d60f584879f024299DA0F19Cdb47B931E35b53')
      })

      it('should match the from and two case 2', async () => {
        const parsedEvent = {
          args: {
            delegate: '0x2dB75d8404144CD5918815A44B8ac3f4DB2a7FAf',
          },
        } as unknown as LogDescription

        const info = {
          network,
          transactionIndex: 1,
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
              delegator: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
              fromDelegate: '0x2dB75d8404144CD5918815A44B8ac3f4DB2a7FAf',
              toDelegate: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
            },
          },
          txLog: txReceipt.logs[0],
        }

        sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
        sandbox.stub(Web3Utils, 'findLogsByName').returns([delegateChangedLog as any])

        const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

        expect(result.from).to.equal('0x2dB75d8404144CD5918815A44B8ac3f4DB2a7FAf')
        expect(result.to).to.equal('0xc1d60f584879f024299DA0F19Cdb47B931E35b53')
      })

      it('should return the from and to are the same', async () => {
        const parsedEvent = {
          args: {
            delegate: '0xDelegatorAddress',
          },
        } as unknown as LogDescription

        const info = {
          network,
          transactionIndex: 1,
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
              fromDelegate: '0xDelegatorAddress',
              toDelegate: '0xDelegatorAddress',
            },
          },
          txLog: txReceipt.logs[0],
        }

        sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
        sandbox.stub(Web3Utils, 'findLogsByName').returns([delegateChangedLog as any])

        const result = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

        expect(result.from).to.equal(result.to)
      })
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

      const findPluginStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const _handleTransfer = sandbox.stub(GovernanceErc20Handler, '_handleTransfer').resolves()

      const handlerResponse = await GovernanceErc20Handler.transfer(parsedEvent, info as any)

      expect(handlerResponse).to.be.undefined
      expect(findPluginStub.calledOnceWith(info.address, info.network)).to.be.true
      expect(_handleTransfer.calledTwice).to.be.true
      expect(_handleTransfer.args[0][2]).to.be.eq(ITransferSide.outgoing)
      expect(_handleTransfer.args[1][2]).to.be.eq(ITransferSide.incoming)
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

      const findPluginStub = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(null)

      const handlerResponse = await GovernanceErc20Handler.transfer(parsedEvent, info as any)

      expect(handlerResponse).to.be.undefined
      expect(findPluginStub.calledOnceWith(info.address, info.network)).to.be.true
    })
  })

  describe('_handleDaoMemberShip', () => {
    it('should add member to DAO for governance ERC20 when requirements are met and not a member', async () => {
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock')
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = { address: '0xMember', memberBalance: '1000', memberVotingPower: '2000' }
      const tokenType = ITokenType.ERC20
      const tokenIsGovernance = true
      const plugins = [
        { daoAddress: '0xDao1', network, address: '0xPlugin1', tokenAddress: '0xToken1' },
        { daoAddress: '0xDao2', network, address: '0xPlugin2', tokenAddress: '0xToken2' },
      ] as any

      uniqueValuesStub.returns(['0xDao1', '0xDao2'])
      isMemberOfDaoStub.resolves(false)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, tokenType, tokenIsGovernance, plugins, {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any)

      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.false
      expect(addToDaoStub.callCount).to.equal(2)
      expect(removeFromDaoStub.notCalled).to.be.true
      expect(sendMessageStub.callCount).to.equal(2)
    })

    it('should remove member from DAO for governance ERC20 when requirements are not met and already a member', async () => {
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock')
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = { address: '0xMember', memberBalance: '0', memberVotingPower: '0' }
      const tokenType = ITokenType.ERC20
      const tokenIsGovernance = true
      const plugins = [{ daoAddress: '0xDao1', network, address: '0xPlugin1', tokenAddress: '0xToken1' }] as any
      uniqueValuesStub.returns(['0xDao1'])
      isMemberOfDaoStub.resolves(true)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, tokenType, tokenIsGovernance, plugins, {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any)

      expect(removeFromDaoStub.callCount).to.equal(1)
      expect(addToDaoStub.notCalled).to.be.true
      expect(sendMessageStub.callCount).to.equal(1)
      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.false
    })

    it('should add member to DAO for a non-governance token based on on-chain balance', async () => {
      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock')
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const uniqueValuesStub = sandbox.stub(utils, 'getUniqueValuesByKey')

      const memberTx = { address: '0xMember' }
      const tokenType = ITokenType.ERC721
      const tokenIsGovernance = false
      const plugins = [{ daoAddress: '0xDao1', network, address: '0xPlugin1', tokenAddress: '0xToken1' }] as any
      uniqueValuesStub.returns(['0xDao1'])
      getTokenBalanceAtBlockStub.resolves('500')
      isMemberOfDaoStub.resolves(false)

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, tokenType, tokenIsGovernance, plugins, {
        address: '0xTokenAddress',
        blockNumber: 100,
        network,
      } as any)

      expect(getTokenBalanceAtBlockStub.calledOnce).to.be.true
      expect(addToDaoStub.callCount).to.equal(1)
      expect(removeFromDaoStub.notCalled).to.be.true
      expect(sendMessageStub.callCount).to.equal(1)
    })
  })
})
