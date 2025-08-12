import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { TokenGovernance } from '@modules/memberGovernance/tokenGovernance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:MemberGovernance:TokenGovernance', () => {
  let sandbox: SinonSandbox
  let tokenGovernance: TokenGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testTokenAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    tokenGovernance = new TokenGovernance(testTokenAddress, testNetwork)

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
      const governance = new TokenGovernance(testTokenAddress, testNetwork)
      expect(governance).to.be.instanceOf(TokenGovernance)
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

      const result = await tokenGovernance.getPlugins()

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

      const result = await tokenGovernance.getPlugins(mockSession)

      expect(result).to.equal(mockPlugins)
      expect(
        findStub.calledOnceWith({ tokenAddress: testTokenAddress, network: testNetwork }, null, {
          session: mockSession,
        }),
      ).to.be.true
    })

    it('should return empty array if no plugins found', async () => {
      const findStub = sandbox.stub(Models.Plugin, 'find').resolves([])

      const result = await tokenGovernance.getPlugins()

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

      const result = await tokenGovernance.getPlugins()

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

      const result = await tokenGovernance['getToken']()
      expect(result).to.equal(mockToken)
      expect(
        findOneStub.calledOnceWith({ address: testTokenAddress, network: testNetwork }, null, { session: undefined }),
      ).to.be.true

      // Call again to test caching
      const result2 = await tokenGovernance['getToken']()
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

      const result = await tokenGovernance['getToken'](mockSession)
      expect(result).to.equal(mockToken)
      expect(
        findOneStub.calledOnceWith({ address: testTokenAddress, network: testNetwork }, null, { session: mockSession }),
      ).to.be.true
    })
  })

  describe('getOrCreate', () => {
    it('should return existing token member if found', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
      }

      sandbox.stub(Models.Member, 'findOne').resolves({ address: parsedAddress } as any)
      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should create new token member if not found', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
        tokenIds: [1, 2, 3],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await tokenGovernance.getOrCreate(memberAddress, {
        votingPower: '100',
        tokenIds: ['1', '2', '3'],
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new TokenMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await tokenGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.TokenMember, 'findExistingLog').rejects(error)

      const result = await tokenGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new token member', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
        tokenIds: [],
        delegateReceivedCount: 5,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await tokenGovernance.create(memberAddress, {
        votingPower: '100',
        delegateReceivedCount: 5,
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created TokenMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await tokenGovernance.create(memberAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Restore parseAddress stub to make it return null, which will cause early return
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await tokenGovernance.create(memberAddress, {})

      expect(result).to.be.null
    })
  })

  describe('update', () => {
    it('should update existing token member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '50',
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({ votingPower: '100' }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.update(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.deep.equal({ votingPower: '100' })
      expect(existingMember.update.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Updated TokenMember')).to.be.true
    })

    it('should clear tokenIds when voting power is 0', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '100',
        tokenIds: [1, 2, 3],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({ votingPower: '0', tokenIds: [] }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.update(memberAddress, {
        votingPower: '0',
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '0',
        tokenIds: [],
        lastVPBlockNumber: 12345,
      })
    })

    it('should skip update if block number is older', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '100',
        lastVPBlockNumber: 12345,
        update: sandbox.stub(),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.update(memberAddress, {
        votingPower: '200',
        lastActivity: 10000,
      })

      expect(result).to.equal(existingMember)
      expect(existingMember.update.called).to.be.false
      expect(loggerVerboseStub.calledWith('Skipping update - older block')).to.be.true
    })

    it('should return null if member not found', async () => {
      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)

      const result = await tokenGovernance.update(memberAddress, { votingPower: '100' })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('TokenMember not found for update')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await tokenGovernance.update(memberAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.TokenMember, 'findExistingLog').rejects(error)

      const result = await tokenGovernance.update(memberAddress, {})

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error updating TokenMember')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing token member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted TokenMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)

      const result = await tokenGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('TokenMember not found for deletion')).to.be.true
    })

    it('should return false if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await tokenGovernance.delete(memberAddress)

      expect(result).to.be.false
    })

    it('should handle errors and return false', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.TokenMember, 'findExistingLog').rejects(error)

      const result = await tokenGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error deleting TokenMember')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find token member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
      }

      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            tokenAddress: testTokenAddress,
            memberAddress: parsedAddress,
          },
          { session: undefined },
        ),
      ).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' } as any
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
      }

      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await tokenGovernance.findOne(memberAddress, mockSession)

      expect(result).to.equal(existingMember)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            tokenAddress: testTokenAddress,
            memberAddress: parsedAddress,
          },
          { session: mockSession },
        ),
      ).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await tokenGovernance.findOne(memberAddress)

      expect(result).to.be.null
    })
  })
})
