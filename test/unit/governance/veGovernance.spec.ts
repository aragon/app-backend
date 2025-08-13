import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { VeGovernance, BaseGovernance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:MemberGovernance:VeGovernance', () => {
  let sandbox: SinonSandbox
  let veGovernance: VeGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testTokenAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    veGovernance = new VeGovernance(testTokenAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('inheritance', () => {
    it('should extend BaseGovernance', () => {
      expect(veGovernance).to.be.instanceOf(VeGovernance)
      expect(veGovernance).to.be.instanceOf(BaseGovernance)
    })

    it('should inherit all methods from BaseGovernance', () => {
      expect(veGovernance.getOrCreate).to.be.a('function')
      expect(veGovernance.create).to.be.a('function')
      expect(veGovernance.update).to.be.a('function')
      expect(veGovernance.delete).to.be.a('function')
      expect(veGovernance.findOne).to.be.a('function')
      expect(veGovernance.getOrCreatePluginMetrics).to.be.a('function')
      expect(veGovernance.findAndPaginateMembers).to.be.a('function')
      expect(veGovernance.updateDaoMetrics).to.be.a('function')
    })
  })

  describe('constructor', () => {
    it('should initialize with escrow token address and network', () => {
      const governance = new VeGovernance(testTokenAddress, testNetwork)
      expect(governance['address']).to.equal(testTokenAddress)
      expect(governance['tokenAddress']).to.equal(testTokenAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getOrCreate', () => {
    it('should use TokenMember model through inherited implementation', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '100',
        tokenIds: ['1'], // VE tokens often have NFT representation
      }

      sandbox.stub(Models.Member, 'findOne').resolves({ address: parsedAddress } as any)
      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should create new VE token member if not found', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '1000000000000000000', // 1 veToken
        tokenIds: ['123'], // VE NFT ID
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await veGovernance.getOrCreate(memberAddress, {
        votingPower: '1000000000000000000',
        tokenIds: ['123'],
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(result?.tokenIds).to.deep.equal(['123'])
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new TokenMember')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new VE token member with NFT ID', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '5000000000000000000', // 5 veTokens locked
        tokenIds: ['456'], // VE NFT ID
        delegateReceivedCount: 0,
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.TokenMember, 'create').resolves(newMember as any)

      const result = await veGovernance.create(memberAddress, {
        votingPower: '5000000000000000000',
        tokenIds: ['456'],
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(result?.tokenIds).to.include('456')
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created TokenMember')).to.be.true
    })
  })

  describe('update', () => {
    it('should update VE token member voting power based on lock time', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        tokenIds: ['789'],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '2000000000000000000', // Increased due to longer lock
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.update(memberAddress, {
        votingPower: '2000000000000000000',
        lastActivity: 12345,
      })

      expect(result).to.deep.equal({ votingPower: '2000000000000000000' })
      expect(existingMember.update.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Updated TokenMember')).to.be.true
    })

    it('should handle VE token expiration', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        tokenIds: ['999'],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '0',
          tokenIds: [],
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.update(memberAddress, {
        votingPower: '0', // Lock expired
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '0',
        tokenIds: [], // Clear NFT IDs when voting power is 0
        lastVPBlockNumber: 12345,
      })
    })

    it('should handle multiple VE NFT positions', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        tokenIds: ['100'],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '3000000000000000000',
          tokenIds: ['100', '101', '102'], // Multiple VE positions
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.update(memberAddress, {
        votingPower: '3000000000000000000',
        tokenIds: ['100', '101', '102'],
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '3000000000000000000',
        tokenIds: ['100', '101', '102'],
        lastVPBlockNumber: 12345,
      })
    })
  })

  describe('delete', () => {
    it('should delete existing VE token member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        tokenIds: ['111'],
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted TokenMember')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find VE token member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        network: testNetwork,
        votingPower: '1000000000000000000',
        tokenIds: ['222'],
      }

      const findExistingLogStub = sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(result?.tokenIds).to.include('222')
      expect(findExistingLogStub.calledOnce).to.be.true
    })
  })

  describe('VE-specific scenarios', () => {
    it('should handle time-weighted voting power', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        tokenIds: ['333'],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '950000000000000000', // Decreased due to time decay
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.update(memberAddress, {
        votingPower: '950000000000000000', // Voting power decays over time
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '950000000000000000',
        lastVPBlockNumber: 12345,
      })
    })

    it('should fetch and cache VE token information', async () => {
      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        symbol: 'veToken',
        decimals: 18,
        name: 'Vote Escrowed Token',
        type: 'escrowAdapter',
      }

      const findOneStub = sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)

      const token = await veGovernance['getToken']()

      expect(token).to.equal(mockToken)
      expect(token?.type).to.equal('escrowAdapter')
      expect(findOneStub.calledOnce).to.be.true

      // Call again to test caching
      const token2 = await veGovernance['getToken']()
      expect(token2).to.equal(mockToken)
      expect(findOneStub.calledOnce).to.be.true // Should not be called again
    })

    it('should handle lock extension with increased voting power', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        tokenAddress: testTokenAddress,
        votingPower: '1000000000000000000',
        tokenIds: ['444'],
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({
          votingPower: '4000000000000000000', // Extended lock period
        }),
      }

      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingMember as any)

      const result = await veGovernance.update(memberAddress, {
        votingPower: '4000000000000000000', // User extended lock
        tokenIds: ['444'], // Same NFT ID
        lastActivity: 12345,
      })

      expect(existingMember.update.firstCall.args[0]).to.deep.include({
        votingPower: '4000000000000000000',
        tokenIds: ['444'],
        lastVPBlockNumber: 12345,
      })
    })
  })

  describe('findAndPaginateMembers', () => {
    it('should call Lock.getMembersOfVeLockPlugin with settings and token info', async () => {
      const mockSettings = {
        votingEscrow: {
          maxTime: 86400 * 365 * 4, // 4 years
          slope: 1,
          bias: 0,
        },
      }

      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        decimals: 18,
      }

      const mockResult = {
        docs: [
          { memberAddress: parsedAddress, lockedAmount: '1000', unlockTime: 1234567890 },
          { memberAddress: '0xabcd', lockedAmount: '2000', unlockTime: 1234567891 },
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

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings as any)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)
      const getMembersStub = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResult as any)

      const result = await veGovernance.findAndPaginateMembers({
        paginationParams: { limit: 10, page: 1 },
        extraParams: {
          daoAddress: '0xdao' as HexAddress,
          pluginAddress: '0xplugin' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })

      expect(result).to.equal(mockResult)
      expect(getMembersStub.calledOnce).to.be.true

      const callArgs = getMembersStub.firstCall.args[0]
      expect(callArgs.paginationParams).to.deep.equal({ limit: 10, page: 1 })
      expect(callArgs.pluginAddress).to.equal('0xplugin')
      expect(callArgs.tokenAddress).to.equal(testTokenAddress)
      expect(callArgs.network).to.equal(testNetwork)
      expect(callArgs.settings).to.deep.include({
        maxTime: 126144000, // 4 years in seconds
        slope: 1,
        bias: 0,
        decimals: '1000000000000000000', // 10^18
      })
      expect(callArgs.settings.currentTime).to.be.a('number')
    })

    it('should calculate current time dynamically', async () => {
      const mockSettings = {
        votingEscrow: {
          maxTime: 86400 * 365 * 4,
          slope: 1,
          bias: 0,
        },
      }

      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        decimals: 18,
      }

      const mockResult = {
        docs: [],
        totalDocs: 0,
        limit: 10,
        totalPages: 0,
        page: 1,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings as any)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)
      const getMembersStub = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResult as any)

      const timeBeforeCall = Math.floor(Date.now() / 1000)
      await veGovernance.findAndPaginateMembers({
        extraParams: {
          pluginAddress: '0xplugin' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })
      const timeAfterCall = Math.floor(Date.now() / 1000)

      const callArgs = getMembersStub.firstCall.args[0]
      expect(callArgs.settings.currentTime).to.be.at.least(timeBeforeCall)
      expect(callArgs.settings.currentTime).to.be.at.most(timeAfterCall)
    })

    it('should work with different decimal values', async () => {
      const mockSettings = {
        votingEscrow: {
          maxTime: 86400 * 365 * 4,
          slope: 1,
          bias: 0,
        },
      }

      const mockToken = {
        address: testTokenAddress,
        network: testNetwork,
        decimals: 6, // USDC-like decimals
      }

      const mockResult = {
        docs: [],
        totalDocs: 0,
        limit: 10,
        totalPages: 0,
        page: 1,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings as any)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken as any)
      const getMembersStub = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResult as any)

      await veGovernance.findAndPaginateMembers({
        extraParams: {
          pluginAddress: '0xplugin' as HexAddress,
          tokenAddress: testTokenAddress,
          network: testNetwork,
        },
      })

      const callArgs = getMembersStub.firstCall.args[0]
      expect(callArgs.settings.decimals).to.equal('1000000') // 10^6 for 6 decimals
    })
  })
})
