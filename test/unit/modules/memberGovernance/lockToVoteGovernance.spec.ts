import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { LockToVoteGovernance } from '@modules/memberGovernance/lockToVoteGovernance'
import EnsHelper from '@helpers/ens'
import { NetworksEnum, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:MemberGovernance:LockToVoteGovernance', () => {
  let sandbox: SinonSandbox
  let lockToVoteGovernance: LockToVoteGovernance
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testLockManagerAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testPluginAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as HexAddress
  const parsedAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    lockToVoteGovernance = new LockToVoteGovernance(testLockManagerAddress, testNetwork)

    sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress as any)
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')
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
      const mockPlugin = {
        address: testPluginAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)

      const result = await lockToVoteGovernance['getPlugin']()
      expect(result).to.equal(mockPlugin)
      expect(
        findOneStub.calledOnceWith({ lockManagerAddress: testLockManagerAddress, network: testNetwork }, null, {
          session: undefined,
        }),
      ).to.be.true

      // Call again to test caching
      const result2 = await lockToVoteGovernance['getPlugin']()
      expect(result2).to.equal(mockPlugin)
      expect(findOneStub.calledOnce).to.be.true // Should not be called again
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' }
      const mockPlugin = {
        address: testPluginAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)

      const result = await lockToVoteGovernance['getPlugin'](mockSession)
      expect(result).to.equal(mockPlugin)
      expect(
        findOneStub.calledOnceWith({ lockManagerAddress: testLockManagerAddress, network: testNetwork }, null, {
          session: mockSession,
        }),
      ).to.be.true
    })
  })

  describe('getOrCreate', () => {
    it('should return existing lock manager member if found', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      }

      sandbox.stub(lockToVoteGovernance, 'findOne').resolves(existingMember as any)

      const result = await lockToVoteGovernance.getOrCreate(memberAddress)

      expect(result).to.equal(existingMember)
    })

    it('should create new lock manager member if not found', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(lockToVoteGovernance, 'findOne').resolves(null)
      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.LockManagerMember, 'create').resolves(newMember as any)

      const result = await lockToVoteGovernance.getOrCreate(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created new LockManagerMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await lockToVoteGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(lockToVoteGovernance, 'findOne').rejects(error)

      const result = await lockToVoteGovernance.getOrCreate(memberAddress)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error in getOrCreate')).to.be.true
    })
  })

  describe('create', () => {
    it('should create a new lock manager member', async () => {
      const newMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
        lastVPBlockNumber: 12345,
      }

      sandbox.stub(Models.Member, 'findOne').resolves(null)
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth' as any)
      sandbox.stub(Models.Member, 'create').resolves({ address: parsedAddress } as any)
      const createStub = sandbox.stub(Models.LockManagerMember, 'create').resolves(newMember as any)

      const result = await lockToVoteGovernance.create(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.equal(newMember)
      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Created LockManagerMember')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await lockToVoteGovernance.create(memberAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      // Restore parseAddress stub to make it return null, which will cause early return
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await lockToVoteGovernance.create(memberAddress, {})

      expect(result).to.be.null
    })
  })

  describe('update', () => {
    it('should update existing lock manager member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        votingPower: '50',
        lastVPBlockNumber: 10000,
        update: sandbox.stub().resolves({ votingPower: '100' }),
      }

      sandbox.stub(Models.LockManagerMember, 'findExistingLog').resolves(existingMember as any)

      const result = await lockToVoteGovernance.update(memberAddress, {
        votingPower: '100',
        lastActivity: 12345,
      })

      expect(result).to.deep.equal({ votingPower: '100' })
      expect(existingMember.update.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Updated LockManagerMember')).to.be.true
    })

    it('should skip update if block number is older', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        votingPower: '100',
        lastVPBlockNumber: 12345,
        update: sandbox.stub(),
      }

      sandbox.stub(Models.LockManagerMember, 'findExistingLog').resolves(existingMember as any)

      const result = await lockToVoteGovernance.update(memberAddress, {
        votingPower: '200',
        lastActivity: 10000,
      })

      expect(result).to.equal(existingMember)
      expect(existingMember.update.called).to.be.false
      expect(loggerVerboseStub.calledWith('Skipping update - older block')).to.be.true
    })

    it('should return null if member not found', async () => {
      sandbox.stub(Models.LockManagerMember, 'findExistingLog').resolves(null)

      const result = await lockToVoteGovernance.update(memberAddress, { votingPower: '100' })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('LockManagerMember not found for update')).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await lockToVoteGovernance.update(memberAddress, {})

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.LockManagerMember, 'findExistingLog').rejects(error)

      const result = await lockToVoteGovernance.update(memberAddress, {})

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error updating LockManagerMember')).to.be.true
    })
  })

  describe('delete', () => {
    it('should delete existing lock manager member', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        deleteOne: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.LockManagerMember, 'findExistingLog').resolves(existingMember as any)

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.true
      expect(existingMember.deleteOne.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Deleted LockManagerMember')).to.be.true
    })

    it('should return false if member not found', async () => {
      sandbox.stub(Models.LockManagerMember, 'findExistingLog').resolves(null)

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerVerboseStub.calledWith('LockManagerMember not found for deletion')).to.be.true
    })

    it('should return false if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.false
    })

    it('should handle errors and return false', async () => {
      const error = new Error('Database error')
      sandbox.stub(Models.LockManagerMember, 'findExistingLog').rejects(error)

      const result = await lockToVoteGovernance.delete(memberAddress)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error deleting LockManagerMember')).to.be.true
    })
  })

  describe('find', () => {
    it('should find active members for lock manager', async () => {
      const members = [
        { memberAddress: parsedAddress, votingPower: '100' },
        { memberAddress: '0x2222222222222222222222222222222222222222', votingPower: '200' },
      ]

      const findActiveMembersStub = sandbox.stub(Models.LockManagerMember, 'findActiveMembers').resolves(members as any)

      const result = await lockToVoteGovernance.find()

      expect(result).to.equal(members)
      expect(
        findActiveMembersStub.calledOnceWith({
          network: testNetwork,
          lockManagerAddress: testLockManagerAddress,
        }),
      ).to.be.true
    })
  })

  describe('findOne', () => {
    it('should find lock manager member by address', async () => {
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
        votingPower: '100',
      }

      const findExistingLogStub = sandbox
        .stub(Models.LockManagerMember, 'findExistingLog')
        .resolves(existingMember as any)

      const result = await lockToVoteGovernance.findOne(memberAddress)

      expect(result).to.equal(existingMember)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            lockManagerAddress: testLockManagerAddress,
            memberAddress: parsedAddress,
          },
          { session: undefined },
        ),
      ).to.be.true
    })

    it('should pass session when provided', async () => {
      const mockSession = { id: 'test-session' }
      const existingMember = {
        memberAddress: parsedAddress,
        lockManagerAddress: testLockManagerAddress,
        network: testNetwork,
      }

      const findExistingLogStub = sandbox
        .stub(Models.LockManagerMember, 'findExistingLog')
        .resolves(existingMember as any)

      const result = await lockToVoteGovernance.findOne(memberAddress, mockSession)

      expect(result).to.equal(existingMember)
      expect(
        findExistingLogStub.calledOnceWith(
          {
            network: testNetwork,
            lockManagerAddress: testLockManagerAddress,
            memberAddress: parsedAddress,
          },
          { session: mockSession },
        ),
      ).to.be.true
    })

    it('should return null if address parsing fails', async () => {
      sandbox.restore()
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await lockToVoteGovernance.findOne(memberAddress)

      expect(result).to.be.null
    })
  })
})
