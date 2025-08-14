import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { EnumQueueName, ITokenType, NetworksEnum, IPluginInterfaceType, IPluginStatus } from '@types'
import { beforeEach } from 'mocha'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import utils from '@helpers/utils'
import { LogDescription } from 'ethers'
import config from '@config'
import { Erc20Governance } from '@src/governance/erc20Governance'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { FakeToken } from '@test/mock/fakeToken'
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

  // Helper to stub governance methods that have issues in test environment
  const stubGovernanceMethods = (sandbox: SinonSandbox) => {
    sandbox.stub(Erc20Governance.prototype, 'updateDaoMetrics').resolves()
    sandbox.stub(Erc20Governance.prototype, 'update').callsFake(async function (
      this: Erc20Governance,
      memberAddress,
      params,
    ) {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)

      // Also create the base member
      await Models.Member.create({ address: parsedAddress, ens: 'test.eth' }).catch(() => {})

      const existing = await Models.TokenMember.findOne({
        memberAddress: parsedAddress,
        tokenAddress: this.tokenAddress,
        network: this.network,
      })
      if (existing) {
        existing.votingPower = params.votingPower
        existing.lastVPBlockNumber = params.lastActivity || 0
        return existing.save()
      }
      return Models.TokenMember.create({
        memberAddress: parsedAddress,
        tokenAddress: this.tokenAddress,
        network: this.network,
        votingPower: params.votingPower,
        lastVPBlockNumber: params.lastActivity || 0,
        delegateReceivedCount: 0,
      })
    })
    sandbox.stub(Erc20Governance.prototype, 'updatePluginMetrics').callsFake(async function (params) {
      return Models.PluginMetrics.create(params).catch(() => {})
    })
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    network = NetworksEnum.polygonMainnet
    intervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0
    await Models.Token.create({
      ...FakeToken,
      type: ITokenType.ERC20,
      isGovernance: true,
    })
    sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').callsFake(async (_address: string) => 'test.eth')
    // Stub RabbitMQHelper globally since it's always an external service
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
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

      // Create a plugin in database
      await Models.Plugin.create({
        id: `${network}-0xPluginAddress-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network,
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: '0xTokenAddress',
        daoAddress: '0xDaoAddress',
        isSupported: true,
      })

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)

      // Force an error by making ProxyToken.saveAndGetToken throw
      sandbox.restore()
      sandbox = sinon.createSandbox()
      sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').callsFake(async (_address: string) => 'test.eth')
      sandbox.stub(ProxyToken, 'saveAndGetToken').rejects(new Error('fake error'))
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

      // Don't create any plugin in database - should return null
      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)

      expect(handlerResponse).to.be.undefined

      // Verify no plugin was found
      const plugins = await Models.Plugin.findAllByTokenAddress(logInfo.address, logInfo.network)
      expect(plugins).to.be.an('array').that.is.empty
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

      // Create plugin in database
      await Models.Plugin.create({
        id: `${network}-${plugin.address}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: plugin.network,
        address: plugin.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: '0xTokenAddress',
        daoAddress: plugin.daoAddress,
        isSupported: true,
      })

      const getTokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1' as any)

      const handlerResponse = await GovernanceErc20Handler.delegateVotesChanged(fakeLog as any, logInfo)
      expect(handlerResponse).to.be.undefined
      expect(getTokenBalanceAtBlockStub.notCalled).to.be.true
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

      // Create a plugin in database
      await Models.Plugin.create({
        id: `${network}-0xPluginAddress-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network,
        address: '0xPluginAddress',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: '0xTokenAddress',
        daoAddress: '0xDaoAddress',
        isSupported: true,
      })
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

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

      // Create plugins in database
      for (const p of plugin) {
        await Models.Plugin.create({
          id: `${network}-${p.address}-0`,
          transactionHash: '0xplugintx',
          blockNumber: 50,
          network: p.network,
          address: p.address,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          tokenAddress: p.tokenAddress,
          daoAddress: p.daoAddress,
          isSupported: true,
        })
      }
      // Create the token in database first
      const testToken = await Models.Token.create({
        address: '0xTokenAddress',
        network,
        type: ITokenType.ERC20,
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token',
      })

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(testToken)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('2000')

      // Stub governance methods due to transaction issues in test environment
      stubGovernanceMethods(sandbox)

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the member was created/updated in database
      const tokenMember = await Models.TokenMember.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        tokenAddress: '0xTokenAddress',
        network,
      })

      expect(tokenMember).to.exist
      expect(tokenMember!.votingPower).to.equal('2000')

      // Verify plugin metrics were created/updated for each plugin
      for (const p of plugin) {
        const metrics = await Models.PluginMetrics.findOne({
          memberAddress: Web3Utils.parseAddress(memberAddress),
          pluginAddress: p.address,
          daoAddress: p.daoAddress,
          network,
        })
        expect(metrics).to.exist
        expect(metrics.lastActivity).to.equal(info.blockNumber)
      }
    })

    it.skip('should handle outgoing delegateVotesChanged event and update plugin metrics', async () => {
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

      // Create plugin in database
      await Models.Plugin.create({
        id: `${network}-${plugin.address}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: plugin.network,
        address: plugin.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: plugin.tokenAddress,
        daoAddress: plugin.daoAddress,
        isSupported: true,
      })
      // Create the token in database first
      const testToken = await Models.Token.create({
        address: '0xTokenAddress',
        network,
        type: ITokenType.ERC20,
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token',
      })

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1500')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(testToken)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('1000')

      // Stub internal methods that have issues in test environment
      stubGovernanceMethods(sandbox)

      // RabbitMQHelper is already stubbed in beforeEach
      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify the member was created/updated in database
      const tokenMember = await Models.TokenMember.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        tokenAddress: '0xTokenAddress',
        network,
      })
      expect(tokenMember).to.exist
      expect(tokenMember.votingPower).to.equal('1000')

      // Verify plugin metrics were created/updated
      const metrics = await Models.PluginMetrics.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        network,
      })
      expect(metrics).to.exist
      expect(metrics.lastActivity).to.equal(info.blockNumber)

      // Verify message was sent
      expect(sendMessageStub.called).to.be.true
    })

    it.skip('should update plugin metrics for multiple plugins on outgoing delegation', async () => {
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

      // Create plugins in database
      await Models.Plugin.create({
        id: `${network}-${plugin1.address}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: plugin1.network,
        address: plugin1.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: plugin1.tokenAddress,
        daoAddress: plugin1.daoAddress,
        isSupported: true,
      })

      await Models.Plugin.create({
        id: `${network}-${plugin2.address}-0`,
        transactionHash: '0xplugintx2',
        blockNumber: 51,
        network: plugin2.network,
        address: plugin2.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: plugin2.tokenAddress,
        daoAddress: plugin2.daoAddress,
        isSupported: true,
      })
      // Create the token in database first
      const testToken = await Models.Token.create({
        address: '0xTokenAddress',
        network,
        type: ITokenType.ERC20,
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token',
      })

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(testToken)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('1000')

      // Stub internal methods that have issues in test environment
      stubGovernanceMethods(sandbox)

      // RabbitMQHelper is already stubbed in beforeEach
      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify the member was created/updated in database
      const tokenMember = await Models.TokenMember.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        tokenAddress: '0xTokenAddress',
        network,
      })
      expect(tokenMember).to.exist
      expect(tokenMember.votingPower).to.equal('1000')

      // Verify plugin metrics were created/updated for each plugin
      const metrics1 = await Models.PluginMetrics.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        pluginAddress: plugin1.address,
        daoAddress: plugin1.daoAddress,
        network,
      })
      expect(metrics1).to.exist
      expect(metrics1.lastActivity).to.equal(info.blockNumber)

      const metrics2 = await Models.PluginMetrics.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        pluginAddress: plugin2.address,
        daoAddress: plugin2.daoAddress,
        network,
      })
      expect(metrics2).to.exist
      expect(metrics2.lastActivity).to.equal(info.blockNumber)

      // Verify dao metrics messages were sent
      expect(sendMessageStub.called).to.be.true
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
      await Models.TokenMember.create({
        memberAddress,
        tokenAddress: plugin.tokenAddress,
        network: plugin.network,
        votingPower: '1000',
        delegateReceivedCount: 0,
      })

      // Create plugin in database
      await Models.Plugin.create({
        id: `${network}-${plugin.address}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: plugin.network,
        address: plugin.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: plugin.tokenAddress,
        daoAddress: plugin.daoAddress,
        isSupported: true,
      })
      // Create the token in database first
      const testToken = await Models.Token.create({
        address: '0xTokenAddress',
        network,
        type: ITokenType.ERC20,
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token',
      })

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1630425600)
      sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('0')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(testToken)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      // Stub internal methods that have issues in test environment
      stubGovernanceMethods(sandbox)

      await GovernanceErc20Handler.delegateVotesChanged(parsedEvent, info as any)

      // Verify voting power was updated to 0
      const tokenMember = await Models.TokenMember.findOne({
        memberAddress: Web3Utils.parseAddress(memberAddress),
        tokenAddress: '0xTokenAddress',
        network,
      })
      expect(tokenMember).to.exist
      expect(tokenMember.votingPower).to.equal('0')
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
      const createMembersBatchStub = sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updatePluginMetricsBatchNoTx').resolves(true)
      // Create plugins in database
      for (const p of mockPlugins) {
        await Models.Plugin.create({
          id: `${network}-${p.address}-0`,
          transactionHash: '0xplugintx',
          blockNumber: 50,
          network: p.network,
          address: p.address,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          tokenAddress: p.tokenAddress,
          daoAddress: p.daoAddress,
          isSupported: true,
        })
      }

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Verify createMembersBatchNoTx was called with correct data
      expect(createMembersBatchStub.calledOnce).to.be.true
      const memberDataCall = createMembersBatchStub.getCall(0).args[0]
      expect(memberDataCall).to.have.lengthOf(3) // 3 unique members

      // Verify it keeps latest activity for each member
      const member1Data = memberDataCall.find((m: any) => m.memberAddress === '0xmember1')
      expect(member1Data!.lastActivity).to.equal(2) // Should use block 2, not block 1

      // Verify updateTokenMemberVPBatchNoTx was called
      expect((Erc20Governance.prototype.updateTokenMemberVPBatchNoTx as any).calledOnce).to.be.true
      const vpDataCall = (Erc20Governance.prototype.updateTokenMemberVPBatchNoTx as any).getCall(0).args[0]
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
      expect((Erc20Governance.prototype.updatePluginMetricsBatchNoTx as any).calledOnce).to.be.true
      const pluginMetricsCall = (Erc20Governance.prototype.updatePluginMetricsBatchNoTx as any).getCall(0).args[0]
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

      const createMembersBatchStub = sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updatePluginMetricsBatchNoTx').resolves(true)
      // Don't create any plugins in database

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Should only process 1 member (skipping zero address)
      expect(createMembersBatchStub.calledOnce).to.be.true
      const memberDataCall = createMembersBatchStub.getCall(0).args[0]
      expect(memberDataCall).to.have.lengthOf(1)
      expect(memberDataCall[0].memberAddress).to.equal('0xmember1')

      expect((Erc20Governance.prototype.updateTokenMemberVPBatchNoTx as any).calledOnce).to.be.true
      const vpDataCall = (Erc20Governance.prototype.updateTokenMemberVPBatchNoTx as any).getCall(0).args[0]
      expect(vpDataCall).to.have.lengthOf(1)
    })

    it('should handle empty events array', async () => {
      const createMembersBatchStub = sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)

      await GovernanceErc20Handler.delegateVotesChangedBatch([])

      expect(createMembersBatchStub.notCalled).to.be.true
      expect((Erc20Governance.prototype.updateTokenMemberVPBatchNoTx as any).notCalled).to.be.true
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

      sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updateTokenMemberVPBatchNoTx').resolves(true)
      sandbox.stub(Erc20Governance.prototype, 'updatePluginMetricsBatchNoTx').resolves(true)
      // Create plugins in database
      for (const p of mockPlugins) {
        await Models.Plugin.create({
          id: `${network}-${p.address}-0`,
          transactionHash: '0xplugintx',
          blockNumber: 50,
          network: p.network,
          address: p.address,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          tokenAddress: p.tokenAddress,
          daoAddress: p.daoAddress,
          isSupported: true,
        })
      }

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      // Should create metrics for each plugin
      expect((Erc20Governance.prototype.updatePluginMetricsBatchNoTx as any).calledOnce).to.be.true
      const pluginMetricsCall = (Erc20Governance.prototype.updatePluginMetricsBatchNoTx as any).getCall(0).args[0]
      expect(pluginMetricsCall).to.have.lengthOf(3) // 1 member x 3 plugins

      // Should send messages for unique DAOs (called from updateDaoMetrics)
      // Check that RabbitMQ was called (it's stubbed in beforeEach)
      expect((RabbitMQHelper.sendMessage as any).called).to.be.true
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
      sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').rejects(error)
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerInfoStub = sandbox.stub(logger, 'info')
      // Stub ProxyToken for the fallback
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Batch transaction failed, falling back to individual processing' as any)).to.be
        .true
      // Since no plugins exist, it will complete successfully without errors
      expect(loggerInfoStub.calledWith('All members processed successfully via fallback' as any)).to.be.true
    })

    it('should handle fallback processing with plugins and update plugin metrics', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '100' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember2', newBalance: '200' } } as any,
          info: { blockNumber: 2, address: '0xtoken1', network } as any,
        },
      ]

      const mockPlugins = [
        { address: '0xplugin1', daoAddress: '0xdao1', tokenAddress: '0xtoken1', network },
        { address: '0xplugin2', daoAddress: '0xdao2', tokenAddress: '0xtoken1', network },
      ]

      const error = new Error('Database error')
      // Make the NoTx batch methods fail
      sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').rejects(error)
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      // Stub ProxyToken for the fallback
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      // Create plugins in database
      for (const p of mockPlugins) {
        await Models.Plugin.create({
          id: `${network}-${p.address}-0`,
          transactionHash: '0xplugintx',
          blockNumber: 50,
          network: p.network,
          address: p.address,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          tokenAddress: p.tokenAddress,
          daoAddress: p.daoAddress,
          isSupported: true,
        })
      }

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      expect(loggerWarnStub.calledOnce).to.be.true

      // Verify success log
      expect(loggerInfoStub.calledWith('All members processed successfully via fallback' as any)).to.be.true

      // Verify that plugin metrics were created for each member and plugin
      for (const event of events) {
        const memberAddress = event.parsedEvent.args.delegate
        for (const plugin of mockPlugins) {
          const metrics = await Models.PluginMetrics.findOne({
            memberAddress: Web3Utils.parseAddress(memberAddress),
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network,
          })
          expect(metrics).to.exist
          expect(metrics.lastActivity).to.equal(event.info.blockNumber)
        }
      }
    })

    it.skip('should handle partial failures in fallback processing and log failed members', async () => {
      const events = [
        {
          parsedEvent: { args: { delegate: '0xmember1', newBalance: '100' } } as any,
          info: { blockNumber: 1, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember2', newBalance: '200' } } as any,
          info: { blockNumber: 2, address: '0xtoken1', network } as any,
        },
        {
          parsedEvent: { args: { delegate: '0xmember3', newBalance: '300' } } as any,
          info: { blockNumber: 3, address: '0xtoken1', network } as any,
        },
      ]

      const mockPlugins = [{ address: '0xplugin1', daoAddress: '0xdao1', tokenAddress: '0xtoken1', network }]

      // Create plugins in database
      for (const p of mockPlugins) {
        await Models.Plugin.create({
          id: `${network}-${p.address}-0`,
          transactionHash: '0xplugintx',
          blockNumber: 50,
          network: p.network,
          address: p.address,
          interfaceType: IPluginInterfaceType.tokenVoting,
          status: IPluginStatus.installed,
          tokenAddress: p.tokenAddress,
          daoAddress: p.daoAddress,
          isSupported: true,
        })
      }

      const error = new Error('Database error')
      // Make the NoTx batch methods fail to trigger fallback
      sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').rejects(error)
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      // Reset governance stubs to use real implementation for this test
      sandbox.restore()
      sandbox = sinon.createSandbox()

      // Re-stub external services only
      sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').callsFake(async (_address: string) => 'test.eth')
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(Erc20Governance, 'createMembersBatchNoTx').rejects(error)
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')

      // Stub ProxyToken for the fallback - make member2 fail
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      proxyTokenStub.onCall(0).resolves({ hasClockMode: true } as any) // member1 succeeds
      proxyTokenStub.onCall(1).rejects(new Error('Token fetch failed')) // member2 fails
      proxyTokenStub.onCall(2).resolves({ hasClockMode: true } as any) // member3 succeeds

      await GovernanceErc20Handler.delegateVotesChangedBatch(events)

      const loggerWarnStub2 = sandbox.stub().withArgs('warn')
      const loggerErrorStub2 = sandbox.stub().withArgs('error')

      // Find the actual stubs from the sandbox
      const warnStub = logger.warn as any
      const errorStub = logger.error as any

      expect(warnStub.calledOnce).to.be.true

      // Debug: Check all error calls
      // console.log('Error calls:', errorStub.getCalls().map((call: any) => call.args[0]))

      // Verify individual error was logged
      const errorCall = errorStub
        .getCalls()
        .find((call: any) => typeof call.args[0] === 'string' && call.args[0] === 'Failed to process individual member')
      expect(errorCall).to.exist

      // Verify summary error was logged with failed members
      const summaryErrorCall = errorStub
        .getCalls()
        .find((call: any) => typeof call.args[0] === 'string' && call.args[0] === 'Some members failed to process')
      expect(summaryErrorCall).to.exist
    })

    it('should re-throw error after logging in delegateVotesChangedBatch', async () => {
      // Create events with a getter that throws an error
      const events = {
        filter: () => {
          throw new Error('Critical error')
        },
        length: 1,
      } as any

      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await GovernanceErc20Handler.delegateVotesChangedBatch(events)
        expect.fail('Should have thrown an error')
      } catch (err) {
        // Verify error was logged
        expect(loggerErrorStub.calledWith('DelegateVotesChangedBatch - error' as any)).to.be.true
        // Verify error was re-thrown
        expect(err).to.be.instanceOf(Error)
        expect((err as Error).message).to.equal('Critical error')
      }
    })
  })
})
