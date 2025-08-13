import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { MultisigGovernance, PluginGovernance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:MemberGovernance:MultisigGovernance', () => {
  let sandbox: SinonSandbox
  let multisigGovernance: MultisigGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    multisigGovernance = new MultisigGovernance(testPluginAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('inheritance', () => {
    it('should extend PluginGovernance', () => {
      expect(multisigGovernance).to.be.instanceOf(MultisigGovernance)
      expect(multisigGovernance).to.be.instanceOf(PluginGovernance)
    })

    it('should inherit all methods from PluginGovernance', () => {
      expect(multisigGovernance.getOrCreate).to.be.a('function')
      expect(multisigGovernance.create).to.be.a('function')
      expect(multisigGovernance.update).to.be.a('function')
      expect(multisigGovernance.delete).to.be.a('function')
      expect(multisigGovernance.findOne).to.be.a('function')
      expect(multisigGovernance.getOrCreatePluginMetrics).to.be.a('function')
      expect(multisigGovernance.findAndPaginateMembers).to.be.a('function')
      expect(multisigGovernance.updateDaoMetrics).to.be.a('function')
    })
  })

  describe('constructor', () => {
    it('should initialize with plugin address and network', () => {
      const governance = new MultisigGovernance(testPluginAddress, testNetwork)
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

      const result = await multisigGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should create new multisig member if not found', async () => {
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

      const result = await multisigGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new PluginMember')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new multisig member', async () => {
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

      const result = await multisigGovernance.create(memberAddress, {})

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created PluginMember')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing multisig member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await multisigGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(findOneStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted PluginMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      sandbox.stub(Models.PluginMember, 'findOne').resolves(null)

      const result = await multisigGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('PluginMember not found for deletion')).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find multisig member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await multisigGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' } as any
      const existingMember = {
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(existingMember as any)

      const result = await multisigGovernance.findOne(memberAddress, mockSession)

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
  })

  describe('integration with PluginGovernance', () => {
    it('should properly handle plugin fetching', async () => {
      const mockPlugin = {
        address: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)

      const plugin = await multisigGovernance['getPlugin']()

      expect(plugin).to.equal(mockPlugin)
      expect(findOneStub.calledOnce).to.be.true
    })
  })
})
