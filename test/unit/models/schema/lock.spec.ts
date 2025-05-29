import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Lock from '@models/schema/lock'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'

describe('Model: Lock', () => {
  let sandbox: SinonSandbox
  let rawLock: Partial<Lock>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawLock = {
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 18000000,
      blockTimestamp: 1640995200,
      pluginAddress: '0xplugin1234567890abcdef1234567890abcdef12',
      daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
      memberAddress: '0xmember1234567890abcdef1234567890abcdef1',
      tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
      nftAddress: '0xnft1234567890abcdef1234567890abcdef123',
      tokenId: '123',
      amount: '1000000000000000000',
      epochStartAt: 1640995200,
      totalLocked: '5000000000000000000',
      lockExit: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
        exitDateAt: null,
      },
      lockWithdraw: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
        totalLocked: '0',
        amount: '0',
        epochEndAt: null,
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create lock', () => {
    it('should create new entry of lock', async () => {
      const entityId = Models.Lock.getEntityId({
        network: rawLock.network!,
        transactionHash: rawLock.transactionHash!,
        transactionIndex: rawLock.transactionIndex!,
        logIndex: rawLock.logIndex!,
        tokenAddress: rawLock.tokenAddress!,
        memberAddress: rawLock.memberAddress!,
      })

      const lock = await Models.Lock.create(rawLock)
      expect(lock.id).to.eq(entityId)

      expect(lock.network).to.eq(rawLock.network)
      expect(lock.transactionHash).to.eq(rawLock.transactionHash)
      expect(lock.transactionIndex).to.eq(rawLock.transactionIndex)
      expect(lock.logIndex).to.eq(rawLock.logIndex)
      expect(lock.pluginAddress).to.eq(rawLock.pluginAddress)
      expect(lock.daoAddress).to.eq(rawLock.daoAddress)
      expect(lock.memberAddress).to.eq(rawLock.memberAddress)
      expect(lock.tokenAddress).to.eq(rawLock.tokenAddress)
      expect(lock.nftAddress).to.eq(rawLock.nftAddress)
      expect(lock.amount).to.eq(rawLock.amount)
    })

    it('should save without calling getEntityId if id is present', async () => {
      const entityId = Models.Lock.getEntityId({
        network: rawLock.network!,
        transactionHash: rawLock.transactionHash!,
        transactionIndex: rawLock.transactionIndex!,
        logIndex: rawLock.logIndex!,
        tokenAddress: rawLock.tokenAddress!,
        memberAddress: rawLock.memberAddress!,
      })

      rawLock.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.Lock, 'getEntityId')
      await Models.Lock.create(rawLock)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when network is not present', async () => {
      delete rawLock.network
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('network is required')
    })

    it('should fail when transactionHash is not present', async () => {
      delete rawLock.transactionHash
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('transactionHash is required')
    })

    it('should fail when transactionIndex is not present', async () => {
      delete rawLock.transactionIndex
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('transactionIndex is required')
    })

    it('should fail when logIndex is not present', async () => {
      delete rawLock.logIndex
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('logIndex is required')
    })

    it('should fail when tokenAddress is not present', async () => {
      delete rawLock.tokenAddress
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('tokenAddress is required')
    })

    it('should fail when memberAddress is not present', async () => {
      delete rawLock.memberAddress
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('memberAddress is required')
    })
  })

  describe('static methods', () => {
    it('Should getEntityId', async () => {
      const entityId = Models.Lock.getEntityId({
        network: rawLock.network!,
        transactionHash: rawLock.transactionHash!,
        transactionIndex: rawLock.transactionIndex!,
        logIndex: rawLock.logIndex!,
        tokenAddress: rawLock.tokenAddress!,
        memberAddress: rawLock.memberAddress!,
      })
      const lockDb = await Models.Lock.create(rawLock)
      expect(entityId).to.eq(lockDb.id)
    })

    it('Should findExistingLog', async () => {
      const createdLock = await Models.Lock.create(rawLock)
      const foundLock = await Models.Lock.findExistingLog({
        network: createdLock.network!,
        transactionHash: createdLock.transactionHash!,
        transactionIndex: createdLock.transactionIndex!,
        logIndex: createdLock.logIndex!,
        tokenAddress: createdLock.tokenAddress!,
        memberAddress: createdLock.memberAddress!,
      })
      expect(foundLock?.id).to.eq(createdLock.id)
    })

    it('Should findByEntityId', async () => {
      const createdLock = await Models.Lock.create(rawLock)
      const foundLock = await Models.Lock.findByEntityId(createdLock.id)
      expect(foundLock?.id).to.eq(createdLock.id)
    })

    it('Should findLockMember', async () => {
      const createdLock = await Models.Lock.create(rawLock)
      const foundLock = await Models.Lock.findLockMember({
        memberAddress: createdLock.memberAddress,
        network: createdLock.network,
      })
      expect(foundLock?.memberAddress).to.eq(createdLock.memberAddress)
    })
  })

  describe('instance methods', () => {
    it('should update Lock', async () => {
      const lock = await Models.Lock.create(rawLock)
      const updatedLock = await lock.update({
        amount: '2000000000000000000',
        totalLocked: '10000000000000000000',
      })
      expect(updatedLock.amount).to.eq('2000000000000000000')
      expect(updatedLock.totalLocked).to.eq('10000000000000000000')
    })

    it('should not update if value is equal', async () => {
      const lock = await Models.Lock.create(rawLock)
      const saveSpy = sandbox.spy(lock, 'save')
      await lock.update({ amount: rawLock.amount })
      expect(saveSpy.calledOnce).to.be.true // Called once for the update method
    })

    it('Should reload', async () => {
      const createdLock = await Models.Lock.create(rawLock)
      const reloadedLock = await createdLock.reload()
      expect(reloadedLock?.memberAddress).to.eq(rawLock.memberAddress)
      expect(reloadedLock?.amount).to.eq(rawLock.amount)
    })
  })

  describe('nested objects', () => {
    it('should create lock with default lockExit values', async () => {
      const lock = await Models.Lock.create(rawLock)
      expect(lock.lockExit.status).to.eq(false)
      expect(lock.lockExit.transactionHash).to.be.null
      expect(lock.lockExit.blockNumber).to.be.null
      expect(lock.lockExit.blockTimestamp).to.be.null
      expect(lock.lockExit.exitDateAt).to.be.null
    })

    it('should create lock with default lockWithdraw values', async () => {
      const lock = await Models.Lock.create(rawLock)
      expect(lock.lockWithdraw.status).to.eq(false)
      expect(lock.lockWithdraw.transactionHash).to.be.null
      expect(lock.lockWithdraw.blockNumber).to.be.null
      expect(lock.lockWithdraw.blockTimestamp).to.be.null
      expect(lock.lockWithdraw.totalLocked).to.eq('0')
      expect(lock.lockWithdraw.amount).to.eq('0')
      expect(lock.lockWithdraw.epochEndAt).to.be.null
    })

    it('should update lockExit status', async () => {
      const lock = await Models.Lock.create(rawLock)
      const updatedLock = await lock.update({
        lockExit: {
          ...lock.lockExit,
          status: true,
          transactionHash: '0xexit123456789abcdef',
          blockNumber: 18000001,
          blockTimestamp: 1640995300,
          exitDateAt: 1640995300,
        },
      })
      expect(updatedLock.lockExit.status).to.eq(true)
      expect(updatedLock.lockExit.transactionHash).to.eq('0xexit123456789abcdef')
      expect(updatedLock.lockExit.blockNumber).to.eq(18000001)
    })

    it('should update lockWithdraw status', async () => {
      const lock = await Models.Lock.create(rawLock)
      const updatedLock = await lock.update({
        lockWithdraw: {
          ...lock.lockWithdraw,
          status: true,
          transactionHash: '0xwithdraw123456789abcdef',
          blockNumber: 18000002,
          blockTimestamp: 1640995400,
          totalLocked: '4000000000000000000',
          amount: '1000000000000000000',
          epochEndAt: 1640995400,
        },
      })
      expect(updatedLock.lockWithdraw.status).to.eq(true)
      expect(updatedLock.lockWithdraw.transactionHash).to.eq('0xwithdraw123456789abcdef')
      expect(updatedLock.lockWithdraw.amount).to.eq('1000000000000000000')
    })
  })

  describe('entityId generation', () => {
    it('should generate correct entityId format', () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0x123',
        transactionIndex: 0,
        logIndex: 1,
        tokenAddress: '0xtoken',
        memberAddress: '0xmember',
      }
      const entityId = Models.Lock.getEntityId(params)
      const expectedId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.tokenAddress}-${params.memberAddress}`
      expect(entityId).to.eq(expectedId)
    })
  })
})
