import '@test/environment'
import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import DbTx from '@modules/dbTx'
import { LockToVoteGovernance } from '@src/governance/lockToVoteGovernance'
import { type HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Governance:LockToVoteGovernance', () => {
  let sandbox: SinonSandbox
  let lockToVoteGovernance: LockToVoteGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testLockManagerAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testPluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
  const testDaoAddress = '0xdaodaodaodaodaodaodaodaodaodaodaodaodao' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    lockToVoteGovernance = new LockToVoteGovernance(testLockManagerAddress, testNetwork)

    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')

    // Only stub external services
    sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with lock manager address and network', () => {
      const governance = new LockToVoteGovernance(testLockManagerAddress, testNetwork)
      expect(governance).to.be.instanceOf(LockToVoteGovernance)
      expect(governance['address']).to.equal(testLockManagerAddress)
      expect(governance['lockManagerAddress']).to.equal(testLockManagerAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getPlugin', () => {
    it('should fetch and cache plugin by lock manager address', async () => {
      // Create a plugin in database
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress}-0`,
        transactionHash: '0xplugintx',
        blockNumber: 50,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        lockManagerAddress: testLockManagerAddress,
        daoAddress: testDaoAddress,
        isSupported: true,
      })

      const result = await lockToVoteGovernance['getPlugin']()
      expect(result).to.exist
      expect(result?.address).to.equal(testPluginAddress)
      expect(result?.lockManagerAddress).to.equal(testLockManagerAddress)

      // Call again to test caching - should use cached value
      const result2 = await lockToVoteGovernance['getPlugin']()
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
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        lockManagerAddress: testLockManagerAddress,
        daoAddress: testDaoAddress,
        isSupported: true,
      })

      // Start a session
      const session = await Models.Plugin.startSession()

      const result = await lockToVoteGovernance['getPlugin'](session)

      await session.endSession()

      expect(result).to.exist
      expect(result?.lockManagerAddress).to.equal(testLockManagerAddress)
    })
  })

  describe('getOrCreate', () => {
    it('should return existing lock manager member if found', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member in database
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      })

      const result = await lockToVoteGovernance.getOrCreate(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.votingPower).to.equal('100')
    })

    it('should create new lock manager member if not found', async () => {
      const result = await lockToVoteGovernance.getOrCreate(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.lockManagerAddress).to.equal(testLockManagerAddress)
      expect(result?.network).to.equal(testNetwork)
      expect(result?.votingPower).to.equal('100')
      expect(result?.lastVPBlockNumber).to.equal(12345)

      // Verify it was saved to database
      const savedMember = await Models.LockToVoteMember.findOne({
        memberAddress: result?.memberAddress,
        lockManagerAddress: testLockManagerAddress,
      })
      expect(savedMember).to.exist
      expect(savedMember?.votingPower).to.equal('100')

      // Verify base member was also created
      const baseMember = await Models.Member.findOne({ address: result?.memberAddress })
      expect(baseMember).to.exist
      expect(baseMember?.ens).to.equal('test.eth')

      expect(loggerVerboseStub.calledWith('Created new LockToVoteMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await lockToVoteGovernance.getOrCreate('invalid' as HexAddress)

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Force an error by passing an invalid address format that causes parsing to fail
      const result = await lockToVoteGovernance.getOrCreate('0xinvalid' as HexAddress)

      expect(result).to.be.null
    })

    it('should handle database error during creation and return null', async () => {
      // Stub LockToVoteMember.create to throw an error
      sandbox.stub(Models.LockToVoteMember, 'create').rejects(new Error('Database error'))

      const result = await lockToVoteGovernance.getOrCreate(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new lock manager member', async () => {
      // The create method delegates to getOrCreate, which needs the ENS helper to work
      // This is already stubbed in beforeEach
      const result = await lockToVoteGovernance.create(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.lockManagerAddress).to.equal(testLockManagerAddress)
      expect(result?.votingPower).to.equal('100')
      expect(result?.lastVPBlockNumber).to.equal(12345)

      // Verify it was saved to database
      const savedMember = await Models.LockToVoteMember.findOne({
        memberAddress: result?.memberAddress,
        lockManagerAddress: testLockManagerAddress,
      })
      expect(savedMember).to.exist
      expect(savedMember?.votingPower).to.equal('100')

      expect(loggerVerboseStub.calledWith('Created new LockToVoteMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await lockToVoteGovernance.create('invalid' as HexAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const result = await lockToVoteGovernance.create('0xinvalid' as HexAddress, {})

      expect(result).to.be.null
    })
  })

  describe('update', () => {
    it('should update existing lock manager member', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member in database
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '50',
        lastVPBlockNumber: 10000,
      })

      const result = await lockToVoteGovernance.update(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.exist
      expect(result?.votingPower).to.equal('100')
      expect(result?.lastVPBlockNumber).to.equal(12345)

      // Verify it was updated in database
      const updatedMember = await Models.LockToVoteMember.findOne({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
      })
      expect(updatedMember?.votingPower).to.equal('100')

      expect(loggerVerboseStub.calledWith('Updated LockToVoteMember')).to.be.true
    })

    it('should skip update if block number is older', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create existing member with newer block number
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
        lastVPBlockNumber: 12345,
      })

      const result = await lockToVoteGovernance.update(memberAddress, {
        votingPower: '200',
        lastActivity: 10000, // Older block
      })

      expect(result).to.exist
      expect(result?.votingPower).to.equal('100') // Should not change
      expect(result?.lastVPBlockNumber).to.equal(12345) // Should not change

      expect(loggerVerboseStub.calledWith('Skipping update - older block')).to.be.true
    })

    it('should create member if not found during update', async () => {
      const result = await lockToVoteGovernance.update(memberAddress, { votingPower: '100' })

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.votingPower).to.equal('100')

      // Verify it was created in database
      const savedMember = await Models.LockToVoteMember.findOne({
        memberAddress: result?.memberAddress,
        lockManagerAddress: testLockManagerAddress,
      })
      expect(savedMember).to.exist

      // Since it's created via getOrCreate, the 'Created new LockToVoteMember' message should be logged
      expect(loggerVerboseStub.calledWith('Created new LockToVoteMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      const result = await lockToVoteGovernance.update('invalid' as HexAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const result = await lockToVoteGovernance.update('0xinvalid' as HexAddress, {})

      expect(result).to.be.null
    })

    it('should return null when getOrCreate returns null', async () => {
      // Stub getOrCreate to return null
      sandbox.stub(lockToVoteGovernance as any, 'getOrCreate').resolves(null)

      const result = await lockToVoteGovernance.update(memberAddress, { votingPower: '100' })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('Failed to get or create LockToVoteMember for update')).to.be.true
    })

    it('should handle database error during update transaction and return null', async () => {
      // Stub DbTx.executeTxFn to throw an error
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Transaction error'))

      const result = await lockToVoteGovernance.update(memberAddress, { votingPower: '100' })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error updating LockToVoteMember')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing lock manager member', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to delete
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      })

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.true

      // Verify it was deleted from database
      const deletedMember = await Models.LockToVoteMember.findOne({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
      })
      expect(deletedMember).to.be.null

      expect(loggerVerboseStub.calledWith('Deleted LockToVoteMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('LockToVoteMember not found for deletion')).to.be.true
    })

    it('should return false if address parsing fails', async () => {
      const result = await lockToVoteGovernance.delete('invalid' as HexAddress)

      expect(result).to.be.false
    })

    it('should handle errors and return false', async () => {
      const result = await lockToVoteGovernance.delete('0xinvalid' as HexAddress)

      expect(result).to.be.false
    })

    it('should handle database error during delete transaction and return false', async () => {
      // Stub DbTx.executeTxFn to throw an error
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Transaction error'))

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error deleting LockToVoteMember')).to.be.true
    })
  })

  describe('find', () => {
    it('should find active members for lock manager', async () => {
      // Create some members in database
      const addresses = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']

      for (let i = 0; i < addresses.length; i++) {
        const parsedAddr = Web3Utils.parseAddress(addresses[i] as HexAddress)
        await Models.LockToVoteMember.create({
          memberAddress: parsedAddr,
          lockManagerAddress: testLockManagerAddress,
          network: testNetwork,
          votingPower: `${(i + 1) * 100}`,
        })
      }

      const result = await lockToVoteGovernance.find()

      expect(result).to.exist
      expect(result).to.have.lengthOf(2)
      expect(result[0].votingPower).to.equal('200')
      expect(result[1].votingPower).to.equal('100')
    })
  })

  describe('findOne', () => {
    it('should find lock manager member by address', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to find
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      })

      const result = await lockToVoteGovernance.findOne(memberAddress)

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
      expect(result?.votingPower).to.equal('100')
    })

    it('should pass session when provided', async () => {
      const parsedAddress = Web3Utils.parseAddress(memberAddress)
      // Create a member to find
      await Models.LockToVoteMember.create({
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      })

      // Start a session
      const session = await Models.LockToVoteMember.startSession()

      const result = await lockToVoteGovernance.findOne(memberAddress, session)

      await session.endSession()

      expect(result).to.exist
      expect(result?.memberAddress.toLowerCase()).to.equal(memberAddress.toLowerCase())
    })

    it('should return null if address parsing fails', async () => {
      const result = await lockToVoteGovernance.findOne('invalid' as HexAddress)

      expect(result).to.be.null
    })
  })
})
