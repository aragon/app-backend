import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { MultisigGovernance, PluginGovernance } from '@src/governance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress, IPluginInterfaceType, IPluginStatus, EnumQueueName } from '@types'
import Web3Utils from '@helpers/web3Utils'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Governance:MultisigGovernance', () => {
  let sandbox: SinonSandbox
  let multisigGovernance: MultisigGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    multisigGovernance = new MultisigGovernance(testPluginAddress, testNetwork)

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')

    // Only stub external services
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
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
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should use PluginMember model through inherited implementation', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member in database
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await multisigGovernance.getOrCreate(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.daoAddress).to.equal(testDaoAddress)
      expect(result?.network).to.equal(testNetwork)
    })

    it('should create new multisig member if not found', async () => {
      const result = await multisigGovernance.getOrCreate(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.daoAddress).to.equal(testDaoAddress)
      expect(result?.network).to.equal(testNetwork)

      // Verify it was saved to database
      const savedMember = await Models.PluginMember.findOne({
        memberAddress: result?.memberAddress,
        pluginAddress: testPluginAddress,
      })
      expect(savedMember).to.exist
      expect(savedMember?.daoAddress).to.equal(testDaoAddress)

      // Verify base member was also created
      const baseMember = await Models.Member.findOne({ address: result?.memberAddress })
      expect(baseMember).to.exist
      expect(baseMember?.ens).to.equal('test.eth')

      expect(loggerVerboseStub.calledWith('Created new PluginMember')).to.be.true
    })

    it('should return null if plugin not found', async () => {
      // Delete the plugin we created
      await Models.Plugin.deleteOne({ address: testPluginAddress })

      const result = await multisigGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })

    it('should return null for invalid address', async () => {
      const result = await multisigGovernance.getOrCreate('invalid' as HexAddress)

      expect(result).to.be.null
    })
  })

  describe('create', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should create a new multisig member', async () => {
      const result = await multisigGovernance.create(memberAddress, {})

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.daoAddress).to.equal(testDaoAddress)
      expect(result?.network).to.equal(testNetwork)

      // Verify it was saved to database
      const savedMember = await Models.PluginMember.findOne({
        memberAddress: result?.memberAddress,
        pluginAddress: testPluginAddress,
      })
      expect(savedMember).to.exist
      expect(savedMember?.daoAddress).to.equal(testDaoAddress)

      expect(loggerVerboseStub.calledWith('Created new PluginMember')).to.be.true
    })

    it('should not create duplicate member', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await multisigGovernance.create(memberAddress, {})

      // Should still return something but not create a duplicate
      expect(result).to.exist

      // Verify only one member exists
      const members = await Models.PluginMember.find({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
      })
      expect(members).to.have.lengthOf(1)
    })

    it('should create plugin metrics when creating member', async () => {
      const result = await multisigGovernance.create(memberAddress, { lastActivity: 1680000000 })

      expect(result).to.exist

      // Verify plugin metrics were created
      const metrics = await Models.PluginMetrics.findOne({
        memberAddress: result?.memberAddress,
        pluginAddress: testPluginAddress,
      })
      expect(metrics).to.exist
      expect(metrics?.lastActivity).to.equal(1680000000)
      expect(metrics?.firstActivity).to.equal(1680000000)
    })
  })

  describe('delete', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should delete existing multisig member', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to delete
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await multisigGovernance.delete(memberAddress)

      expect(result).to.be.true

      // Verify it was deleted from database
      const deletedMember = await Models.PluginMember.findOne({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
      })
      expect(deletedMember).to.be.null

      expect(loggerVerboseStub.calledWith('Deleted PluginMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      const result = await multisigGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('PluginMember not found for deletion')).to.be.true
    })

    it('should return false for invalid address', async () => {
      const result = await multisigGovernance.delete('invalid' as HexAddress)

      expect(result).to.be.false
    })
  })

  describe('findOne', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should find multisig member by address', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to find
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await multisigGovernance.findOne(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.network).to.equal(testNetwork)
    })

    it('should return null if member not found', async () => {
      const result = await multisigGovernance.findOne(memberAddress)

      expect(result).to.be.null
    })

    it('should pass session when provided', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to find
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      // Start a session
      const session = await Models.PluginMember.startSession()

      const result = await multisigGovernance.findOne(memberAddress, session)

      await session.endSession()

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
    })
  })

  describe('update', () => {
    it('should throw not implemented error', async () => {
      try {
        await multisigGovernance.update(memberAddress, {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Update not implemented')
      }
    })
  })

  describe('integration with PluginGovernance', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should properly handle plugin fetching', async () => {
      const plugin = await multisigGovernance['getPlugin']()

      expect(plugin).to.exist
      expect(plugin?.address).to.equal(testPluginAddress)
      expect(plugin?.daoAddress).to.equal(testDaoAddress)
      expect(plugin?.network).to.equal(testNetwork)
    })

    it('should cache plugin after first fetch', async () => {
      const plugin1 = await multisigGovernance['getPlugin']()
      const plugin2 = await multisigGovernance['getPlugin']()

      expect(plugin1).to.equal(plugin2)
      expect(plugin1?.address).to.equal(testPluginAddress)
    })
  })

  describe('multisig-specific scenarios', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should handle multisig member without voting power', async () => {
      // Multisig members don't have voting power
      const result = await multisigGovernance.create(memberAddress, {})

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())

      // Verify no voting power field for multisig
      const savedMember = await Models.PluginMember.findOne({
        memberAddress: result?.memberAddress,
        pluginAddress: testPluginAddress,
      })
      expect(savedMember).to.exist
      expect(savedMember?.votingPower).to.be.undefined
    })

    it('should handle multiple multisig operations in sequence', async () => {
      // Create
      const created = await multisigGovernance.create(memberAddress, {})
      expect(created).to.exist

      // Find
      const found = await multisigGovernance.findOne(memberAddress)
      expect(found).to.exist
      expect(found?.memberAddress.toLowerCase()).to.equal(created?.memberAddress.toLowerCase())

      // Delete
      const deleted = await multisigGovernance.delete(memberAddress)
      expect(deleted).to.be.true

      // Verify deleted
      const notFound = await multisigGovernance.findOne(memberAddress)
      expect(notFound).to.be.null
    })
  })

  describe('findAndPaginateMembers', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })

      // Create multiple multisig members
      for (let i = 0; i < 5; i++) {
        const addr = `0x${i.toString().padStart(40, '0')}` as HexAddress
        const parsedAddr = Web3Utils.parseAddress(addr)

        // Create base member
        await Models.Member.create({
          address: parsedAddr,
          ens: `test${i}.eth`,
        })

        // Create plugin member
        await Models.PluginMember.create({
          memberAddress: parsedAddr,
          pluginAddress: testPluginAddress,
          daoAddress: testDaoAddress,
          network: testNetwork,
        })
      }
    })

    it('should paginate multisig members', async () => {
      const result = await multisigGovernance.findAndPaginateMembers({
        paginationParams: { limit: 2, page: 1 },
      })

      expect(result).to.exist
      expect(result.data).to.exist
      expect(result.data.length).to.be.greaterThan(0)
      expect(result.metadata).to.exist
      expect(result.metadata.page).to.equal(1)
    })

    it('should filter multisig members by daoAddress', async () => {
      const result = await multisigGovernance.findAndPaginateMembers({
        paginationParams: { limit: 10, page: 1 },
        extraParams: { daoAddress: testDaoAddress },
      })

      expect(result).to.exist
      expect(result.data).to.have.lengthOf(5)
      expect(result.data[0].address.toLowerCase()).to.include('0000000000000000000000000000000000000000')
    })
  })

  describe('updateDaoMetrics', () => {
    beforeEach(async () => {
      // Create a Plugin for testing
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        daoAddress: testDaoAddress,
        isSupported: true,
      })
    })

    it('should send DAO metrics update message', async () => {
      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub

      await multisigGovernance.updateDaoMetrics()

      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: testDaoAddress,
          params: { address: testDaoAddress, network: testNetwork },
        }),
      ).to.be.true
    })

    it('should throw error when plugin is missing', async () => {
      // Delete the plugin
      await Models.Plugin.deleteOne({ address: testPluginAddress })

      try {
        await multisigGovernance.updateDaoMetrics()
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
      }

      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub
      expect(sendMessageStub.called).to.be.false
    })
  })
})
