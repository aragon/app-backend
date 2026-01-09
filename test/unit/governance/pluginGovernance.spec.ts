import '@test/environment'
import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import { PluginGovernance } from '@src/governance/pluginGovernance'
import { EnumQueueName, type HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Governance:PluginGovernance', () => {
  let sandbox: SinonSandbox
  let pluginGovernance: PluginGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    pluginGovernance = new PluginGovernance(testPluginAddress, testNetwork)

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerErrorStub = sandbox.stub(Logger, 'error')

    // Only stub external services
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    // Stub DbTx for transaction handling - don't stub it, let it work with the mock db
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
      // Create a plugin in database
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

      const result = await pluginGovernance['getPlugin']()
      expect(result).to.exist
      expect(result?.address).to.equal(testPluginAddress)
      expect(result?.daoAddress).to.equal(testDaoAddress)
      expect(result?.network).to.equal(testNetwork)

      // Call again to test caching - should use cached value
      const result2 = await pluginGovernance['getPlugin']()
      expect(result2).to.exist
      expect(result2?.address).to.equal(testPluginAddress)
    })

    it('should pass session when provided', async () => {
      // Create a plugin in database
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

      // Start a session
      const session = await Models.Plugin.startSession()

      const result = await pluginGovernance['getPlugin'](session)

      await session.endSession()

      expect(result).to.exist
      expect(result?.address).to.equal(testPluginAddress)
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

    it('should return existing plugin member if found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member in database
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await pluginGovernance.getOrCreate(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.daoAddress).to.equal(testDaoAddress)
      expect(result?.network).to.equal(testNetwork)
    })

    it('should create new plugin member if not found', async () => {
      const result = await pluginGovernance.getOrCreate(memberAddress, { votingPower: '100' })

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

    it('should create plugin metrics when lastActivity is provided', async () => {
      const result = await pluginGovernance.getOrCreate(memberAddress, {
        votingPower: '100',
        lastActivity: 1680000000,
      })

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

    it('should return null if plugin not found', async () => {
      // Delete the plugin we created
      await Models.Plugin.deleteOne({ address: testPluginAddress })

      const result = await pluginGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await pluginGovernance.getOrCreate('invalid' as HexAddress)

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Force an error by passing an invalid address format
      const result = await pluginGovernance.getOrCreate('0xinvalid' as HexAddress)

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

    it('should create a new plugin member', async () => {
      const result = await pluginGovernance.create(memberAddress, { votingPower: '100' })

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

      const result = await pluginGovernance.create(memberAddress, { votingPower: '100' })

      // Should still return something but not create a duplicate
      expect(result).to.exist

      // Verify only one member exists
      const members = await Models.PluginMember.find({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
      })
      expect(members).to.have.lengthOf(1)
    })

    it('should return null if address parsing fails', async () => {
      const result = await pluginGovernance.create('invalid' as HexAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Delete the plugin to force an error
      await Models.Plugin.deleteOne({ address: testPluginAddress })

      const result = await pluginGovernance.create(memberAddress, {})

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
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

    it('should delete existing plugin member', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to delete
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await pluginGovernance.delete(memberAddress)

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
      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('PluginMember not found for deletion')).to.be.true
    })

    it('should return false if address parsing fails', async () => {
      const result = await pluginGovernance.delete('invalid' as HexAddress)

      expect(result).to.be.false
    })

    it('should handle errors and return false', async () => {
      const result = await pluginGovernance.delete('0xinvalid' as HexAddress)

      expect(result).to.be.false
    })

    it('should handle database error during delete and return false', async () => {
      // Import DbTx to stub it
      const DbTx = require('@modules/dbTx').default

      // Stub DbTx.executeTxFn to throw an error
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Database error'))

      const result = await pluginGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error deleting PluginMember')).to.be.true
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

    it('should find plugin member by address', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to find
      await Models.PluginMember.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      const result = await pluginGovernance.findOne(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.pluginAddress).to.equal(testPluginAddress)
      expect(result?.network).to.equal(testNetwork)
    })

    it('should return null if member not found', async () => {
      const result = await pluginGovernance.findOne(memberAddress)

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

      const result = await pluginGovernance.findOne(memberAddress, session)

      await session.endSession()

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
    })

    it('should return null if address parsing fails', async () => {
      const result = await pluginGovernance.findOne('invalid' as HexAddress)

      expect(result).to.be.null
    })
  })

  describe('getOrCreatePluginMetrics', () => {
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

    it('should return existing plugin metrics if found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing metrics
      await Models.PluginMetrics.create({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
        voteCount: 5,
        proposalCount: 2,
        firstActivity: 1680000000,
        lastActivity: 1680001000,
      })

      const result = await pluginGovernance.getOrCreatePluginMetrics({
        memberAddress: parsedAddress as HexAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
      })

      expect(result).to.exist
      expect(result?.voteCount).to.equal(5)
      expect(result?.proposalCount).to.equal(2)
    })

    it('should create new plugin metrics if not found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)

      const result = await pluginGovernance.getOrCreatePluginMetrics({
        memberAddress: parsedAddress as HexAddress,
        pluginAddress: testPluginAddress,
        daoAddress: testDaoAddress,
        network: testNetwork,
        lastActivity: 1680000000,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.voteCount).to.equal(0)
      expect(result?.proposalCount).to.equal(0)
      expect(result?.firstActivity).to.equal(1680000000)
      expect(result?.lastActivity).to.equal(1680000000)

      // Verify it was saved to database
      const savedMetrics = await Models.PluginMetrics.findOne({
        memberAddress: parsedAddress,
        pluginAddress: testPluginAddress,
      })
      expect(savedMetrics).to.exist

      expect(loggerVerboseStub.calledWith('Created new PluginMetrics')).to.be.true
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

      // Create multiple members
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

    it('should paginate plugin members', async () => {
      const result = await pluginGovernance.findAndPaginateMembers({
        paginationParams: { limit: 2, page: 1 },
      })

      expect(result).to.exist
      expect(result.data).to.exist
      expect(result.data.length).to.be.greaterThan(0)
      expect(result.metadata).to.exist
      expect(result.metadata.page).to.equal(1)
    })

    it('should filter plugin members by daoAddress', async () => {
      const result = await pluginGovernance.findAndPaginateMembers({
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

      await pluginGovernance.updateDaoMetrics()

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
        await pluginGovernance.updateDaoMetrics()
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
      }

      const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub
      expect(sendMessageStub.called).to.be.false
    })
  })
})
