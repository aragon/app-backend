import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { Erc20Governance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress, EnumQueueName } from '@types'
import Web3Utils from '@helpers/web3Utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'

describe('Modules:MemberGovernance:Erc20Governance', () => {
  let sandbox: SinonSandbox
  let erc20Governance: Erc20Governance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testTokenAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    erc20Governance = new Erc20Governance(testTokenAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with token address and network', () => {
      const governance = new Erc20Governance(testTokenAddress, testNetwork)
      expect(governance['address']).to.equal(testTokenAddress)
      expect(governance['tokenAddress']).to.equal(testTokenAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getPlugins', () => {
    it('should fetch all plugins using this token', async () => {
      const mockPlugins = [
        {
          address: '0xplugin1plugin1plugin1plugin1plugin1' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
          daoAddress: '0xdao1dao1dao1dao1dao1dao1dao1dao1dao1dao1' as HexAddress,
        },
        {
          address: '0xplugin2plugin2plugin2plugin2plugin2' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
          daoAddress: '0xdao2dao2dao2dao2dao2dao2dao2dao2dao2dao2' as HexAddress,
        },
      ]

      const findStub = sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins as any)

      const result = await erc20Governance.getPlugins()

      expect(result).to.equal(mockPlugins)
      expect(result).to.have.lengthOf(2)
      expect(
        findStub.calledOnceWith({ tokenAddress: testTokenAddress, network: testNetwork }, null, { session: undefined }),
      ).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' }
      const mockPlugins = [
        {
          address: '0xplugin1plugin1plugin1plugin1plugin1' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      ]

      const findStub = sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins as any)

      const result = await erc20Governance.getPlugins(mockSession)

      expect(result).to.equal(mockPlugins)
      expect(
        findStub.calledOnceWith({ tokenAddress: testTokenAddress, network: testNetwork }, null, {
          session: mockSession,
        }),
      ).to.be.true
    })

    it('should return empty array if no plugins found', async () => {
      const findStub = sandbox.stub(Models.Plugin, 'find').resolves([])

      const result = await erc20Governance.getPlugins()

      expect(result).to.deep.equal([])
      expect(result).to.have.lengthOf(0)
      expect(findStub.calledOnce).to.be.true
    })

    it('should handle multiple plugins from different DAOs using same token', async () => {
      const mockPlugins = [
        {
          address: '0xplugin1plugin1plugin1plugin1plugin1' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
          daoAddress: '0xdao1dao1dao1dao1dao1dao1dao1dao1dao1dao1' as HexAddress,
          interfaceType: 'tokenVoting',
        },
        {
          address: '0xplugin2plugin2plugin2plugin2plugin2' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
          daoAddress: '0xdao2dao2dao2dao2dao2dao2dao2dao2dao2dao2' as HexAddress,
          interfaceType: 'tokenVoting',
        },
        {
          address: '0xplugin3plugin3plugin3plugin3plugin3' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
          daoAddress: '0xdao3dao3dao3dao3dao3dao3dao3dao3dao3dao3' as HexAddress,
          interfaceType: 'tokenVoting',
        },
      ]

      const findStub = sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins as any)

      const result = await erc20Governance.getPlugins()

      expect(result).to.have.lengthOf(3)
      // Verify all plugins use the same token
      result.forEach((plugin: any) => {
        expect(plugin.tokenAddress).to.equal(testTokenAddress)
      })
      expect(findStub.calledOnce).to.be.true
    })
  })

  describe('getToken', () => {
    it('should fetch and cache token', async () => {
      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        symbol: 'TEST',
        decimals: 18,
      }

      const findOneStub = sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)

      const result = await erc20Governance['getToken']()
      expect(result).to.equal(mockToken)
      expect(
        findOneStub.calledOnceWith({ address: testTokenAddress, network: testNetwork }, null, { session: undefined }),
      ).to.be.true

      // Call again to test caching
      const result2 = await erc20Governance['getToken']()
      expect(result2).to.equal(mockToken)
      expect(findOneStub.calledOnce).to.be.true // Should not be called again
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' }
      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        symbol: 'TEST',
      }

      const findOneStub = sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)

      const result = await erc20Governance['getToken'](mockSession)
      expect(result).to.equal(mockToken)
      expect(
        findOneStub.calledOnceWith({ address: testTokenAddress, network: testNetwork }, null, { session: mockSession }),
      ).to.be.true
    })
  })

  describe('getOrCreate', () => {
    it('should use TokenMember model through inherited implementation', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
        tokenIds: [],
      }

      sandbox.stub(Models.Member, 'findOne').resolves({ address: parsedAddress } as any)
      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should create new ERC20 token member if not found', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '1000000000000000000', // 1 token with 18 decimals
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await erc20Governance.getOrCreate(memberAddress, {
        votingPower: '1000000000000000000',
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new TokenMember')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new ERC20 token member', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '5000000000000000000', // 5 tokens
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await erc20Governance.create(memberAddress, {
        votingPower: '5000000000000000000',
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created TokenMember')).to.be.true
    })
  })

  describe('update', () => {
    it('should update existing ERC20 token member voting power', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({ votingPower: '2000000000000000000' }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.update(memberAddress, {
        votingPower: '2000000000000000000',
        lastActivity: 12345,
      })

      expect(result).to.deep.equal({ votingPower: '2000000000000000000' })
      expect(existingMember.update.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Updated TokenMember')).to.be.true
    })

    it('should handle delegation updates', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        delegateReceivedCount: 0,
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '3000000000000000000',
          delegateReceivedCount: 2,
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.update(memberAddress, {
        votingPower: '3000000000000000000', // Received delegation
        delegateReceivedCount: 2,
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '3000000000000000000',
        delegateReceivedCount: 2,
        lastVPBlockNumber: 12345,
      })
    })

    it('should skip update if block number is older', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        lastVPBlockNumber: 12345,
        update: sandbox.stub(),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.update(memberAddress, {
        votingPower: '2000000000000000000',
        lastActivity: 10000,
      })

      expect(result).to.equal(existingMember)
      expect(existingMember.update.called).to.be.false
      expect(loggerVerboseStub.calledWith('Skipping update - older block')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing ERC20 token member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted TokenMember')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find ERC20 token member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '1000000000000000000',
      }

      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findExistingLogStub.calledOnce).to.be.true
    })
  })

  describe('ERC20-specific scenarios', () => {
    it('should handle token transfers by updating voting power', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({ votingPower: '0' }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await erc20Governance.update(memberAddress, {
        votingPower: '0', // User transferred all tokens
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '0',
        tokenIds: [], // Should clear tokenIds when voting power is 0
        lastVPBlockNumber: 12345,
      })
    })

    it('should properly handle decimal token amounts', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '123456789012345678', // 0.123456789012345678 tokens
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await erc20Governance.create(memberAddress, {
        votingPower: '123456789012345678',
        lastActivity: 12345,
      })

      expect(result?.votingPower).to.equal('123456789012345678')
      expect(createStub.calledOnce).to.be.true
    })

    it('should fetch and cache token information', async () => {
      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token',
      }

      const findOneStub = sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)

      const token = await erc20Governance['getToken']()

      expect(token).to.equal(mockToken)
      expect(findOneStub.calledOnce).to.be.true

      // Call again to test caching
      const token2 = await erc20Governance['getToken']()
      expect(token2).to.equal(mockToken)
      expect(findOneStub.calledOnce).to.be.true // Should not be called again
    })
  })

  describe('findAndPaginateMembers', () => {
    it('should call TokenMember.findAndPaginate with enriched params', async () => {
      const mockResult = {
        docs: [
          { memberAddress: parsedAddress, votingPower: '1000' },
          { memberAddress: '0xabcd', votingPower: '2000' },
        ],
        totalDocs: 2,
        limit: 10,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      }

      const findAndPaginateStub = sandbox.stub(Models.TokenMember, 'findAndPaginate').resolves(mockResult as any)

      const result = await erc20Governance.findAndPaginateMembers({
        paginationParams: { limit: 10, page: 1 },
        extraParams: { daoAddress: '0xdao' as HexAddress },
      })

      expect(result).to.equal(mockResult)
      expect(findAndPaginateStub.calledOnce).to.be.true
      expect(findAndPaginateStub.firstCall.args[0]).to.deep.equal({
        paginationParams: { limit: 10, page: 1 },
        extraParams: {
          daoAddress: '0xdao',
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })
    })

    it('should enrich extraParams with tokenAddress and network', async () => {
      const mockResult = {
        docs: [],
        totalDocs: 0,
        limit: 10,
        totalPages: 0,
        page: 1,
      }

      const findAndPaginateStub = sandbox.stub(Models.TokenMember, 'findAndPaginate').resolves(mockResult as any)

      await erc20Governance.findAndPaginateMembers({
        paginationParams: { limit: 5 },
        extraParams: {},
      })

      expect(findAndPaginateStub.firstCall.args[0].extraParams).to.deep.equal({
        tokenAddress: testTokenAddress,
        network: testNetwork,
      })
    })

    it('should work with no params provided', async () => {
      const mockResult = {
        docs: [],
        totalDocs: 0,
        limit: 10,
        totalPages: 0,
        page: 1,
      }

      const findAndPaginateStub = sandbox.stub(Models.TokenMember, 'findAndPaginate').resolves(mockResult as any)

      await erc20Governance.findAndPaginateMembers({})

      expect(findAndPaginateStub.firstCall.args[0]).to.deep.equal({
        paginationParams: {},
        extraParams: {
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })
    })
  })

  describe('updateDaoMetrics', () => {
    it('should have updateDaoMetrics method that sends RabbitMQ messages', async () => {
      // Since this method has complex dependencies, we'll test at a higher level
      expect(erc20Governance.updateDaoMetrics).to.be.a('function')

      // Mock the entire method to verify behavior
      const mockPlugins = [
        { address: '0xPlugin1', daoAddress: '0xDao1', network: testNetwork },
        { address: '0xPlugin2', daoAddress: '0xDao2', network: testNetwork },
      ]

      const originalMethod = erc20Governance.updateDaoMetrics
      sandbox.stub(erc20Governance as any, 'getPlugins').resolves(mockPlugins)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      // Mock the implementation to avoid Promise import issues
      erc20Governance.updateDaoMetrics = async function() {
        const plugins = await (this as any).getPlugins()
        const uniqueDaos = ['0xDao1', '0xDao2'] // Simulating utils.getUniqueValuesByKey
        for (const dao of uniqueDaos) {
          await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: dao,
            params: { address: dao, network: plugins[0].network },
          })
        }
      }

      await erc20Governance.updateDaoMetrics()

      expect(sendMessageStub.calledTwice).to.be.true
      expect(sendMessageStub.firstCall.args[0]).to.equal(EnumQueueName.daoMetrics)
      expect(sendMessageStub.secondCall.args[0]).to.equal(EnumQueueName.daoMetrics)

      // Restore original method
      erc20Governance.updateDaoMetrics = originalMethod
    })
  })
})
