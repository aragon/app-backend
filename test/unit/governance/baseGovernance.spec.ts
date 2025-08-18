import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { BaseGovernance } from '@src/governance/baseGovernance'
import EnsHelper from '@helpers/ens'
import {
  NetworksEnum,
  type HexAddress,
  IGovernanceParamsOpts,
  IPluginInterfaceType,
  IPluginStatus,
  ITokenType,
} from '@types'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import { ClientSession } from 'mongoose'

// Create a concrete implementation for testing
class TestGovernance extends BaseGovernance {
  async getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts): Promise<any> {
    return null
  }

  async create(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<any> {
    return null
  }

  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<any> {
    return null
  }

  async delete(memberAddress: HexAddress): Promise<boolean> {
    return false
  }

  async findOne(memberAddress: HexAddress, session?: ClientSession): Promise<any> {
    return null
  }

  async findAndPaginateMembers(_params: { paginationParams?: any; extraParams?: any }): Promise<any> {
    return { docs: [], totalDocs: 0, limit: 10, totalPages: 0, page: 1 }
  }

  async updateDaoMetrics(): Promise<any> {
    return null
  }

  // Expose static method for testing
  public async testEnsureBaseMember(memberAddress: HexAddress, lastActivity?: number, session?: ClientSession) {
    return BaseGovernance.ensureBaseMember(memberAddress, lastActivity, session)
  }

  public async testFindExistingPluginMetricsByLog(
    params: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
    },
    session?: any,
  ) {
    return this.findExistingPluginMetricsByLog(params, session)
  }

  public async testCreatePluginMetrics(
    params: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    },
    session?: any,
  ) {
    return this.createPluginMetrics(params, session)
  }

  public async testUpdatePluginMetrics(params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }) {
    return this.updatePluginMetrics(params)
  }
}

describe('Governance:BaseGovernance', () => {
  let sandbox: SinonSandbox
  let testGovernance: TestGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub

  const testAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    testGovernance = new TestGovernance(testAddress, testNetwork)

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with address and network', () => {
      const governance = new TestGovernance(testAddress, testNetwork)
      expect(governance).to.be.instanceOf(BaseGovernance)
      expect(governance['address']).to.equal(testAddress)
      expect(governance['network']).to.equal(testNetwork)
      expect(governance['llo']).to.be.a('function')
    })
  })

  describe('ensureBaseMember', () => {
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const lastActivity = 1680000000

    beforeEach(() => {
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
    })

    it('should create a new member with lastActivity', async () => {
      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result).to.be.an('object')
      expect(result?.address.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.ens).to.equal('test.eth')
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(result?.lastActivity).to.equal(lastActivity)

      // Verify it was saved to database
      const savedMember = await Models.Member.findOne({ address: result?.address })
      expect(savedMember).to.exist
      expect(savedMember?.address.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(savedMember?.ens).to.equal('test.eth')
      expect(savedMember?.firstActivity).to.equal(lastActivity)
      expect(savedMember?.lastActivity).to.equal(lastActivity)

      expect(loggerVerboseStub.calledWith('Created base member')).to.be.true
    })

    it('should update existing member lastActivity if provided and newer', async () => {
      // First create a member
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      await Models.Member.create({
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
      })

      const newLastActivity = 1680000000
      const result = await testGovernance.testEnsureBaseMember(memberAddress, newLastActivity)

      expect(result?.lastActivity).to.equal(newLastActivity)
      expect(result?.firstActivity).to.equal(1670000000) // Should not change

      // Verify it was updated in database
      const updatedMember = await Models.Member.findOne({ address: parsedAddress })
      expect(updatedMember?.lastActivity).to.equal(newLastActivity)
      expect(updatedMember?.firstActivity).to.equal(1670000000)
    })

    it('should update firstActivity if not set on existing member', async () => {
      // Create a member without firstActivity
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      await Models.Member.create({
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: null,
        lastActivity: 1670000000,
      })

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result?.lastActivity).to.equal(lastActivity)
      expect(result?.firstActivity).to.equal(lastActivity)

      // Verify it was updated in database
      const updatedMember = await Models.Member.findOne({ address: parsedAddress })
      expect(updatedMember?.lastActivity).to.equal(lastActivity)
      expect(updatedMember?.firstActivity).to.equal(lastActivity)
    })

    it('should return existing member without updating if no lastActivity provided', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      const existingMember = await Models.Member.create({
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
      })

      const result = await testGovernance.testEnsureBaseMember(memberAddress)

      expect(result?.address.toLowerCase()).to.equal(existingMember.address.toLowerCase())
      expect(result?.lastActivity).to.equal(existingMember.lastActivity)
      expect(result?.firstActivity).to.equal(existingMember.firstActivity)
    })

    it('should not update if lastActivity is older than existing', async () => {
      const olderActivity = 1660000000
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      await Models.Member.create({
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
      })

      const result = await testGovernance.testEnsureBaseMember(memberAddress, olderActivity)

      expect(result?.lastActivity).to.equal(1670000000) // Should not change

      // Verify it was not updated in database
      const member = await Models.Member.findOne({ address: parsedAddress })
      expect(member?.lastActivity).to.equal(1670000000)
    })

    it('should return null if address parsing fails', async () => {
      const result = await testGovernance.testEnsureBaseMember('invalid' as HexAddress, lastActivity)
      expect(result).to.be.null
    })

    it('should handle errors gracefully and return null', async () => {
      // Force an error by restoring the stub and creating a new one that throws
      sandbox.restore()
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').rejects(new Error('ENS error'))
      loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error ensuring base member')).to.be.true
    })
  })

  describe('abstract methods', () => {
    it('should define abstract methods that must be implemented', () => {
      expect(testGovernance.getOrCreate).to.be.a('function')
      expect(testGovernance.create).to.be.a('function')
      expect(testGovernance.update).to.be.a('function')
      expect(testGovernance.delete).to.be.a('function')
      expect(testGovernance.findOne).to.be.a('function')
    })
  })

  describe('findExistingPluginMetricsByLog', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress

    beforeEach(async () => {
      // Create a Plugin record for more realistic testing
      await Models.Plugin.create({
        id: `${testNetwork}-${pluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: pluginAddress,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        daoAddress,
        isSupported: true,
      })
    })

    it('should find existing plugin metrics', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create plugin metrics in database
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        voteCount: 5,
        proposalCount: 2,
        firstActivity: 1670000000,
        lastActivity: 1680000000,
      })

      const result = await testGovernance.testFindExistingPluginMetricsByLog({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(pluginAddress)
      expect(result?.voteCount).to.equal(5)
      expect(result?.proposalCount).to.equal(2)
    })

    it('should return null when no metrics exist', async () => {
      const result = await testGovernance.testFindExistingPluginMetricsByLog({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })

    it('should pass session when provided', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create plugin metrics in database
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
        voteCount: 3,
        proposalCount: 1,
      })

      // Start a session to test session passing
      const session = await Models.PluginMetrics.startSession()

      const result = await testGovernance.testFindExistingPluginMetricsByLog(
        {
          memberAddress,
          pluginAddress,
          network: testNetwork,
        },
        session,
      )

      await session.endSession()

      expect(result).to.exist
      expect(result?.voteCount).to.equal(3)
    })

    it('should return null if address parsing fails', async () => {
      const result = await testGovernance.testFindExistingPluginMetricsByLog({
        memberAddress: 'invalid' as HexAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })
  })

  describe('createPluginMetrics', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
    const tokenAddress = '0x1111111111111111111111111111111111111111' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const lastActivity = 1680000000

    beforeEach(async () => {
      // Create a DAO for more realistic testing
      await Models.Dao.create({
        address: daoAddress,
        network: testNetwork,
        name: 'Test DAO',
        subdomain: 'test-dao',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      // Create a Token if needed for token-based governance
      await Models.Token.create({
        address: tokenAddress,
        network: testNetwork,
        type: ITokenType.ERC20,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
      })

      // Create a Plugin with token
      await Models.Plugin.create({
        id: `${testNetwork}-${pluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: pluginAddress,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        daoAddress,
        tokenAddress,
        isSupported: true,
      })
    })

    it('should create new plugin metrics when none exist', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create some proposals and votes to be counted
      await Models.Proposal.create({
        transactionHash: '0xtxhash1',
        blockNumber: 100,
        network: testNetwork,
        pluginAddress,
        daoAddress,
        proposalIndex: '1',
        creatorAddress: parsedAddress,
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 1,
        proposalId: '0x1',
      })
      await Models.Proposal.create({
        transactionHash: '0xtxhash2',
        blockNumber: 101,
        network: testNetwork,
        pluginAddress,
        daoAddress,
        proposalIndex: '2',
        creatorAddress: parsedAddress,
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 2,
        proposalId: '0x2',
      })

      await Models.Vote.create({
        transactionHash: '0xvotetx1',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 102,
        network: testNetwork,
        daoAddress,
        pluginAddress,
        memberAddress: parsedAddress,
        proposalId: '0x1',
        voteOption: 1,
      })

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(pluginAddress)
      expect(result?.daoAddress).to.equal(daoAddress)
      expect(result?.voteCount).to.equal(1)
      expect(result?.proposalCount).to.equal(2)
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(result?.lastActivity).to.equal(lastActivity)

      // Verify it was saved to database
      const savedMetrics = await Models.PluginMetrics.findOne({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
      })
      expect(savedMetrics).to.exist
      expect(savedMetrics?.voteCount).to.equal(1)
      expect(savedMetrics?.proposalCount).to.equal(2)
    })

    it('should return existing metrics if they already exist', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing metrics
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        voteCount: 10,
        proposalCount: 5,
        firstActivity: 1670000000,
        lastActivity: 1675000000,
      })

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      // Should return existing metrics without modification
      expect(result).to.exist
      expect(result?.voteCount).to.equal(10)
      expect(result?.proposalCount).to.equal(5)
      expect(result?.firstActivity).to.equal(1670000000)
      expect(result?.lastActivity).to.equal(1675000000)
    })
  })

  describe('getOrCreatePluginMetrics', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const lastActivity = 1680000000

    it('should return existing plugin metrics if found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing metrics
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        voteCount: 5,
        proposalCount: 2,
        firstActivity: 1670000000,
        lastActivity: 1675000000,
      })

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(5)
      expect(result?.proposalCount).to.equal(2)
      expect(result?.firstActivity).to.equal(1670000000)
      expect(result?.lastActivity).to.equal(1675000000)
    })

    it('should create new plugin metrics with counts if not found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create proposals and votes to be counted
      await Models.Proposal.create({
        transactionHash: '0xtxhash1',
        blockNumber: 100,
        network: testNetwork,
        pluginAddress,
        daoAddress,
        proposalIndex: '1',
        creatorAddress: parsedAddress,
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 1,
        proposalId: '0x1',
      })
      await Models.Proposal.create({
        transactionHash: '0xtxhash2',
        blockNumber: 101,
        network: testNetwork,
        pluginAddress,
        daoAddress,
        proposalIndex: '2',
        creatorAddress: parsedAddress,
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 2,
        proposalId: '0x2',
      })

      for (let i = 0; i < 3; i++) {
        await Models.Vote.create({
          transactionHash: `0xvotetx${i}`,
          transactionIndex: 0,
          logIndex: i,
          blockNumber: 102 + i,
          network: testNetwork,
          daoAddress,
          pluginAddress,
          memberAddress: parsedAddress,
          proposalId: `0x${i}`,
          voteOption: 1,
        })
      }

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(pluginAddress)
      expect(result?.daoAddress).to.equal(daoAddress)
      expect(result?.voteCount).to.equal(3)
      expect(result?.proposalCount).to.equal(2)
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(result?.lastActivity).to.equal(lastActivity)

      expect(loggerVerboseStub.calledWith('Created new PluginMetrics')).to.be.true
    })

    it('should create metrics with zero counts when no proposals or votes exist', async () => {
      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(0)
      expect(result?.proposalCount).to.equal(0)
      // MongoDB may return null or undefined for undefined fields
      expect(result?.daoAddress == null).to.be.true // checks both null and undefined
      expect(result?.firstActivity == null).to.be.true
      expect(result?.lastActivity == null).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress: 'invalid' as HexAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Force an error by making countDocuments fail
      sandbox.restore()
      sandbox.stub(Models.PluginMetrics, 'findExistingLog').rejects(new Error('Database error'))
      loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error getting or creating plugin metrics')).to.be.true
    })
  })

  describe('updatePluginMetrics', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const lastActivity = 1680000000

    it('should update existing plugin metrics', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create initial metrics
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
        voteCount: 1,
        proposalCount: 1,
        firstActivity: 1670000000,
        lastActivity: 1670000000,
      })

      // Add more proposals and votes
      for (let i = 0; i < 5; i++) {
        await Models.Proposal.create({
          transactionHash: `0xtxhash${i}`,
          blockNumber: 100 + i,
          network: testNetwork,
          pluginAddress,
          daoAddress,
          proposalIndex: i.toString(),
          creatorAddress: parsedAddress,
          startDate: 1670000000,
          endDate: 1680000000,
          incrementalId: i,
          proposalId: `0x${i}`,
        })
      }

      for (let i = 0; i < 10; i++) {
        await Models.Vote.create({
          transactionHash: `0xvotetx${i}`,
          transactionIndex: 0,
          logIndex: i,
          blockNumber: 200 + i,
          network: testNetwork,
          daoAddress,
          pluginAddress,
          memberAddress: parsedAddress,
          proposalId: `0x${i}`,
          voteOption: 1,
        })
      }

      const result = await testGovernance.testUpdatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(10)
      expect(result?.proposalCount).to.equal(5)
      expect(result?.lastActivity).to.equal(lastActivity)
      expect(result?.daoAddress).to.equal(daoAddress)

      // Verify database was updated
      const updatedMetrics = await Models.PluginMetrics.findOne({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
      })
      expect(updatedMetrics?.voteCount).to.equal(10)
      expect(updatedMetrics?.proposalCount).to.equal(5)
      expect(updatedMetrics?.lastActivity).to.equal(lastActivity)
      expect(updatedMetrics?.daoAddress).to.equal(daoAddress)

      expect(loggerVerboseStub.calledWith('Updated PluginMetrics')).to.be.true
    })

    it('should create new metrics if they do not exist', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Add proposals and votes
      await Models.Proposal.create({
        transactionHash: '0xtxhash1',
        blockNumber: 100,
        network: testNetwork,
        pluginAddress,
        daoAddress,
        proposalIndex: '1',
        creatorAddress: parsedAddress,
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 1,
        proposalId: '0x1',
      })

      await Models.Vote.create({
        transactionHash: '0xvotetx1',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 200,
        network: testNetwork,
        daoAddress,
        pluginAddress,
        memberAddress: parsedAddress,
        proposalId: '0x1',
        voteOption: 1,
      })
      await Models.Vote.create({
        transactionHash: '0xvotetx2',
        transactionIndex: 0,
        logIndex: 1,
        blockNumber: 201,
        network: testNetwork,
        daoAddress,
        pluginAddress,
        memberAddress: parsedAddress,
        proposalId: '0x2',
        voteOption: 2,
      })

      const result = await testGovernance.testUpdatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(2)
      expect(result?.proposalCount).to.equal(1)
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(result?.lastActivity).to.equal(lastActivity)
      expect(result?.daoAddress).to.equal(daoAddress)

      // Verify it was created in database
      const createdMetrics = await Models.PluginMetrics.findOne({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
      })
      expect(createdMetrics).to.exist
      expect(createdMetrics?.voteCount).to.equal(2)
      expect(createdMetrics?.proposalCount).to.equal(1)
    })

    it('should update without optional params', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create initial metrics
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
        voteCount: 0,
        proposalCount: 0,
        daoAddress: '0x0000000000000000000000000000000000000000',
        firstActivity: 1660000000,
        lastActivity: 1660000000,
      })

      // Add votes and proposals
      await Models.Vote.create({
        transactionHash: '0xvotetx1',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 200,
        network: testNetwork,
        daoAddress: '0x0000000000000000000000000000000000000000',
        pluginAddress,
        memberAddress: parsedAddress,
        proposalId: '0x1',
        voteOption: 1,
      })

      const result = await testGovernance.testUpdatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(1)
      expect(result?.proposalCount).to.equal(0)
      // These should not have changed since we didn't pass them
      expect(result?.daoAddress).to.equal('0x0000000000000000000000000000000000000000')
      expect(result?.lastActivity).to.equal(1660000000)
    })

    it('should return null if address parsing fails', async () => {
      const result = await testGovernance.testUpdatePluginMetrics({
        memberAddress: 'invalid' as HexAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Force an error
      sandbox.restore()
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Transaction error'))
      loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await testGovernance.testUpdatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error updating plugin metrics')).to.be.true
    })
  })
})
