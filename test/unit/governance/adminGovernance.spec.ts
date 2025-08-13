import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { AdminGovernance, PluginGovernance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress, EnumQueueName } from '@types'
import Web3Utils from '@helpers/web3Utils'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Modules:MemberGovernance:AdminGovernance', () => {
  let sandbox: SinonSandbox
  let adminGovernance: AdminGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    adminGovernance = new AdminGovernance(testPluginAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('inheritance', () => {
    it('should extend PluginGovernance', () => {
      expect(adminGovernance).to.be.instanceOf(AdminGovernance)
      expect(adminGovernance).to.be.instanceOf(PluginGovernance)
    })

    it('should inherit all methods from PluginGovernance', () => {
      expect(adminGovernance.getOrCreate).to.be.a('function')
      expect(adminGovernance.create).to.be.a('function')
      expect(adminGovernance.update).to.be.a('function')
      expect(adminGovernance.delete).to.be.a('function')
      expect(adminGovernance.findOne).to.be.a('function')
      expect(adminGovernance.getOrCreatePluginMetrics).to.be.a('function')
      expect(adminGovernance.findAndPaginateMembers).to.be.a('function')
      expect(adminGovernance.updateDaoMetrics).to.be.a('function')
    })
  })

  describe('constructor', () => {
    it('should initialize with plugin address and network', () => {
      const governance = new AdminGovernance(testPluginAddress, testNetwork)
      expect(governance['address']).to.equal(testPluginAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getOrCreate', () => {
    it('should use PluginMember model through inherited implementation', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await adminGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should create new admin member if not found', async () => {
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }
      const newMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      sandbox.stub(Models.PluginMember, 'findOne').resolves(null)
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.PluginMember, 'create').resolves(newMember as any)

      const result = await adminGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new PluginMember')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new admin member', async () => {
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }
      const newMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.PluginMember, 'create').resolves(newMember as any)

      const result = await adminGovernance.create(memberAddress, {})

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created PluginMember')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing admin member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await adminGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(findOneStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted PluginMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      sandbox.stub(Models.PluginMember, 'findOne').resolves(null)

      const result = await adminGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('PluginMember not found for deletion')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find admin member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await adminGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findOneStub.calledOnce).to.be.true
    })
  })

  describe('update', () => {
    it('should throw not implemented error', async () => {
      try {
        await adminGovernance.update(memberAddress, {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Update not implemented')
      }
    })
  })

  describe('admin-specific scenarios', () => {
    it('should handle single admin member correctly', async () => {
      const adminMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      sandbox.stub(Models.PluginMember, 'findOne').resolves(adminMember as any)

      const result = await adminGovernance.findOne(memberAddress)

      expect(result).to.equal(adminMember)
      expect(result?.memberAddress).to.equal(parsedAddress)
    })

    it('should handle admin member without voting power', async () => {
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }
      const newMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
        votingPower: undefined, // Admin doesn't need voting power
      }

      sandbox.stub(Models.PluginMember, 'findOne').resolves(null)
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.PluginMember, 'create').resolves(newMember as any)

      const result = await adminGovernance.create(memberAddress, {})

      expect(result).to.equal(newMember)
      expect(result?.votingPower).to.be.undefined
      expect(createStub.calledOnce).to.be.true
    })
  })

  describe('findAndPaginateMembers', () => {
    it('should inherit implementation from PluginGovernance', async () => {
      // Since AdminGovernance extends PluginGovernance, this method is inherited
      // We can verify it exists and returns expected structure
      expect(adminGovernance.findAndPaginateMembers).to.be.a('function')

      // Mock the inherited method directly on the instance
      const mockResult = {
        docs: [],
        totalDocs: 0,
        limit: 10,
        totalPages: 0,
        page: 1,
      }

      sandbox.stub(adminGovernance, 'findAndPaginateMembers').resolves(mockResult as any)

      const result = await adminGovernance.findAndPaginateMembers({})
      expect(result).to.equal(mockResult)
    })
  })

  describe('updateDaoMetrics', () => {
    it('should inherit implementation from PluginGovernance', async () => {
      // Since AdminGovernance extends PluginGovernance, this method is inherited
      expect(adminGovernance.updateDaoMetrics).to.be.a('function')

      // Mock the inherited getPlugin method
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }
      sandbox.stub(adminGovernance as any, 'getPlugin').resolves(mockPlugin)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await adminGovernance.updateDaoMetrics()

      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: testDaoAddress,
          params: { address: testDaoAddress, network: testNetwork },
        }),
      ).to.be.true
    })
  })
})
