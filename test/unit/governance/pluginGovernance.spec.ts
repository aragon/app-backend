import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { PluginGovernance } from '@src/governance/pluginGovernance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:MemberGovernance:PluginGovernance', () => {
  let sandbox: SinonSandbox
  let pluginGovernance: PluginGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    pluginGovernance = new PluginGovernance(testPluginAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with plugin address and network', () => {
      const governance = new PluginGovernance(testPluginAddress, testNetwork)
      expect(governance).to.be.instanceOf(PluginGovernance)
      expect(governance['address']).to.equal(testPluginAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getPlugin', () => {
    it('should fetch and cache plugin', async () => {
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)

      const result = await pluginGovernance['getPlugin']()
      expect(result).to.equal(mockPlugin)
      expect(
        findOneStub.calledOnceWith({ address: testPluginAddress, network: testNetwork }, null, { session: undefined }),
      ).to.be.true

      // Call again to test caching
      const result2 = await pluginGovernance['getPlugin']()
      expect(result2).to.equal(mockPlugin)
      expect(findOneStub.calledOnce).to.be.true // Should not be called again
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' } as any
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)

      const result = await pluginGovernance['getPlugin'](mockSession)
      expect(result).to.equal(mockPlugin)
      expect(
        findOneStub.calledOnceWith({ address: testPluginAddress, network: testNetwork }, null, {
          session: mockSession,
        }),
      ).to.be.true
    })
  })

  describe('getOrCreate', () => {
    it('should return existing plugin member if found', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(pluginGovernance, 'findOne').resolves(existingMember)

      const result = await pluginGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findOneStub.calledOnceWith(parsedAddress, sinon.match.any)).to.be.true
    })

    it('should create new plugin member if not found', async () => {
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
        votingPower: '100',
      }

      sandbox.stub(pluginGovernance, 'findOne').resolves(null)
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.PluginMember, 'create').resolves(newMember as any)

      const result = await pluginGovernance.getOrCreate(memberAddress, { votingPower: '100' })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new PluginMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await pluginGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(pluginGovernance, 'findOne').rejects(error)

      const result = await pluginGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new plugin member', async () => {
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
        votingPower: '100',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.PluginMember, 'create').resolves(newMember as any)

      const result = await pluginGovernance.create(memberAddress, { votingPower: '100' })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created PluginMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await pluginGovernance.create(memberAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(error)

      const result = await pluginGovernance.create(memberAddress, {})

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error creating PluginMember')).to.be.true
    })
  })

  describe('update', () => {
    it('should throw not implemented error', async () => {
      try {
        await pluginGovernance.update(memberAddress, {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Update not implemented')
      }
    })
  })

  describe('delete', () => {
    it('should delete existing plugin member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(findOneStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted PluginMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      sandbox.stub(Models.PluginMember, 'findOne').resolves(null)

      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('PluginMember not found for deletion')).to.be.true
    })

    it('should return false if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.false
    })

    it('should handle errors and return false', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.PluginMember, 'findOne').rejects(error)

      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error deleting PluginMember')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find plugin member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await pluginGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(
        findOneStub.calledOnceWith(
          {
            memberAddress: parsedAddress,
            pluginAddress: testPluginAddress,
            network: testNetwork,
          },
          null,
          { session: undefined },
        ),
      ).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' } as any
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await pluginGovernance.findOne(memberAddress, mockSession)

      expect(result).to.equal(existingMember)
      expect(
        findOneStub.calledOnceWith(
          {
            memberAddress: parsedAddress,
            pluginAddress: testPluginAddress,
            network: testNetwork,
          },
          null,
          { session: mockSession },
        ),
      ).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await pluginGovernance.findOne(memberAddress)

      expect(result).to.be.null
    })
  })
})
