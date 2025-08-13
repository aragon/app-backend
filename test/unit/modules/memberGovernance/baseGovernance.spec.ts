import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { BaseGovernance } from '@modules/memberGovernance/baseGovernance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress, IGovernanceParamsOpts } from '@types'
import Web3Utils from '@helpers/web3Utils'
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
}

describe('Modules:MemberGovernance:BaseGovernance', () => {
  let sandbox: SinonSandbox
  let testGovernance: TestGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    testGovernance = new TestGovernance(testAddress, testNetwork)

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')
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
    const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
    const lastActivity = 1680000000

    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    })

    it('should create a new member with lastActivity', async () => {
      const findOneStub = sandbox.stub(Models.Member, 'findOne').resolves(null)
      const getEnsStub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      const createStub = sandbox.stub(Models.Member, 'create').resolves({
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: lastActivity,
        lastActivity,
      } as any)

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result).to.be.an('object')
      expect(result?.address).to.equal(parsedAddress)
      expect(result?.ens).to.equal('test.eth')
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(result?.lastActivity).to.equal(lastActivity)

      expect(findOneStub.calledOnce).to.be.true
      expect(getEnsStub.calledOnceWith(parsedAddress)).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created base member')).to.be.true
    })

    it('should update existing member lastActivity if provided and newer', async () => {
      const existingMember = {
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
        update: sandbox.stub().resolves({ address: parsedAddress, lastActivity }),
      }

      const findOneStub = sandbox.stub(Models.Member, 'findOne').resolves(existingMember as any)

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result?.lastActivity).to.equal(lastActivity)
      expect(existingMember.update.calledOnceWith({ lastActivity }, sinon.match.any)).to.be.true
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should update firstActivity if not set on existing member', async () => {
      const existingMember = {
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: null,
        lastActivity: 1670000000,
        update: sandbox.stub().resolves({
          address: parsedAddress,
          lastActivity,
          firstActivity: lastActivity,
        }),
      }

      const findOneStub = sandbox.stub(Models.Member, 'findOne').resolves(existingMember as any)

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result?.lastActivity).to.equal(lastActivity)
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(existingMember.update.calledOnceWith({ lastActivity, firstActivity: lastActivity }, sinon.match.any)).to.be
        .true
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return existing member without updating if no lastActivity provided', async () => {
      const existingMember = {
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
      }

      const findOneStub = sandbox.stub(Models.Member, 'findOne').resolves(existingMember as any)

      const result = await testGovernance.testEnsureBaseMember(memberAddress)

      expect(result).to.deep.equal(existingMember)
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should not update if lastActivity is older than existing', async () => {
      const olderActivity = 1660000000
      const existingMember = {
        address: parsedAddress,
        ens: 'test.eth',
        firstActivity: 1670000000,
        lastActivity: 1670000000,
        update: sandbox.stub(),
      }

      const findOneStub = sandbox.stub(Models.Member, 'findOne').resolves(existingMember as any)

      const result = await testGovernance.testEnsureBaseMember(memberAddress, olderActivity)

      expect(result).to.equal(existingMember)
      expect(existingMember.update.called).to.be.false
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await testGovernance.testEnsureBaseMember(memberAddress, lastActivity)

      expect(result).to.be.null
    })

    it('should handle errors gracefully and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.Member, 'findOne').rejects(error)

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
    const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    })

    it('should find existing plugin metrics', async () => {
      const existingMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
        voteCount: 5,
        proposalCount: 2,
      }

      const findExistingLogStub = sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(existingMetrics as any)

      const result = await testGovernance.testFindExistingPluginMetricsByLog({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.equal(existingMetrics)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            pluginAddress,
            memberAddress: parsedAddress,
          },
          { session: undefined },
        ),
      ).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' }
      const existingMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
      }

      const findExistingLogStub = sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(existingMetrics as any)

      const result = await testGovernance.testFindExistingPluginMetricsByLog(
        {
          memberAddress,
          pluginAddress,
          network: testNetwork,
        },
        mockSession,
      )

      expect(result).to.equal(existingMetrics)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            pluginAddress,
            memberAddress: parsedAddress,
          },
          { session: mockSession },
        ),
      ).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await testGovernance.testFindExistingPluginMetricsByLog({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })
  })

  describe('createPluginMetrics', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
    const lastActivity = 1680000000

    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    })

    it('should create new plugin metrics', async () => {
      const newMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        voteCount: 0,
        proposalCount: 0,
        firstActivity: lastActivity,
        lastActivity,
      }

      const createStub = sandbox.stub(Models.PluginMetrics, 'create').resolves(newMetrics as any)

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.equal(newMetrics)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new PluginMetrics')).to.be.true
    })

    it('should handle creation without daoAddress', async () => {
      const newMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress: undefined,
        network: testNetwork,
        voteCount: 0,
        proposalCount: 0,
        firstActivity: undefined,
        lastActivity: undefined,
      }

      const createStub = sandbox.stub(Models.PluginMetrics, 'create').resolves(newMetrics as any)

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.equal(newMetrics)
      expect(createStub.calledOnce).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.PluginMetrics, 'create').rejects(error)

      const result = await testGovernance.testCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error creating plugin metrics')).to.be.true
    })
  })

  describe('getOrCreatePluginMetrics', () => {
    const pluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
    const daoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
    const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
    const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
    const lastActivity = 1680000000

    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    })

    it('should return existing plugin metrics if found', async () => {
      const existingMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        network: testNetwork,
        voteCount: 5,
        proposalCount: 2,
      }

      const findExistingLogStub = sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(existingMetrics as any)

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.equal(existingMetrics)
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should create new plugin metrics if not found', async () => {
      const newMetrics = {
        memberAddress: parsedAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        voteCount: 0,
        proposalCount: 0,
        firstActivity: lastActivity,
        lastActivity,
      }

      sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(null)
      const createStub = sandbox.stub(Models.PluginMetrics, 'create').resolves(newMetrics as any)

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        daoAddress,
        network: testNetwork,
        lastActivity,
      })

      expect(result).to.equal(newMetrics)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new PluginMetrics')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.PluginMetrics, 'findExistingLog').rejects(error)

      const result = await testGovernance.getOrCreatePluginMetrics({
        memberAddress,
        pluginAddress,
        network: testNetwork,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error getting or creating plugin metrics')).to.be.true
    })
  })
})
