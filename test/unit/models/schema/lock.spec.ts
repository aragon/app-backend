import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Lock from '@models/schema/lock'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import { FakeToken } from '@test/mock/fakeToken'
import Token from '@models/schema/token'
import ModelUtils from '@src/models/utils/models'

describe('Model: Lock', () => {
  let sandbox: SinonSandbox
  let rawLock: Partial<Lock>
  let fakeToken: Partial<Token>
  let lockToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawLock = {
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 18000000,
      blockTimestamp: 1640995200,
      memberAddress: '0xmember1234567890abcdef1234567890abcdef1',
      escrowAddress: '0xescrow1234567890abcdef1234567890abcdef1',
      exitQueueAddress: '0xexitqueue1234567890abcdef1234567890abcdef1',
      tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
      nftAddress: '0xnft1234567890abcdef1234567890abcdef123',
      tokenId: 123,
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
    fakeToken = await Models.Token.create({
      ...FakeToken,
      id: undefined,
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      isGovernance: true,
    })
    lockToken = await Models.Token.create({
      ...FakeToken,
      id: undefined,
      network: NetworksEnum.ethereumMainnet,
      address: '0x1234567890abcdef1234567890abcdef12345600',
      type: ITokenType.ERC721,
    })
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
        tokenId: rawLock.tokenId!,
        escrowAddress: rawLock.escrowAddress!,
      })

      const lock = await Models.Lock.create(rawLock)
      expect(lock.id).to.eq(entityId)

      expect(lock.network).to.eq(rawLock.network)
      expect(lock.transactionHash).to.eq(rawLock.transactionHash)
      expect(lock.transactionIndex).to.eq(rawLock.transactionIndex)
      expect(lock.logIndex).to.eq(rawLock.logIndex)
      expect(lock.memberAddress).to.eq(rawLock.memberAddress)
      expect(lock.tokenAddress).to.eq(rawLock.tokenAddress)
      expect(lock.nftAddress).to.eq(rawLock.nftAddress)
      expect(lock.amount).to.eq(rawLock.amount)
      expect(lock.escrowAddress).to.eq(rawLock.escrowAddress)
      expect(lock.exitQueueAddress).to.eq(rawLock.exitQueueAddress)
    })

    it('should save without calling getEntityId if id is present', async () => {
      const entityId = Models.Lock.getEntityId({
        network: rawLock.network!,
        transactionHash: rawLock.transactionHash!,
        transactionIndex: rawLock.transactionIndex!,
        logIndex: rawLock.logIndex!,
        tokenAddress: rawLock.tokenAddress!,
        memberAddress: rawLock.memberAddress!,
        tokenId: rawLock.tokenId!,
        escrowAddress: rawLock.escrowAddress!,
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

    it('should fail when escrowAddress is not present', async () => {
      delete rawLock.escrowAddress
      await expect(Models.Lock.create(rawLock)).to.be.rejectedWith('escrowAddress is required')
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
        tokenId: rawLock.tokenId!,
        escrowAddress: rawLock.escrowAddress!,
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
        tokenId: rawLock.tokenId!,
        escrowAddress: createdLock.escrowAddress!,
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
        tokenId: '6',
        escrowAddress: '0xplugin',
      }
      const entityId = Models.Lock.getEntityId(params)
      const expectedId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.tokenAddress}-${params.escrowAddress}-${params.memberAddress}-${params.tokenId}`
      expect(entityId).to.eq(expectedId)
    })
  })

  describe('findWithPagination', () => {
    it('should return 2 locks when 2 locks are created', async () => {
      const memberAddress = '0xmember1111111111111111111111111111111111'
      const tokenAddress = fakeToken.address
      const lockTokenAddress = lockToken.address
      const lock1Data = {
        ...rawLock,
        transactionHash: '0x1111111111111111111111111111111111111111',
        blockNumber: 18000001,
        memberAddress,
        tokenAddress,
        escrowAddress: '0xescrow1111111111111111111111111111111111',
        exitQueueAddress: '0xexitqueue1111111111111111111111111111111111',
        nftAddress: lockTokenAddress,
      }
      const lock1 = await Models.Lock.create(lock1Data)

      const lock2Data = {
        ...rawLock,
        transactionHash: '0x2222222222222222222222222222222222222222',
        blockNumber: 18000002,
        memberAddress,
        tokenAddress,
        escrowAddress: '0xescrow2222222222222222222222222222222222',
        transactionIndex: 2,
        logIndex: 2,
        nftAddress: lockTokenAddress,
      }
      const lock2 = await Models.Lock.create(lock2Data)

      const lock3Data = {
        ...rawLock,
        transactionHash: '0x3333333333333333333333333333333333333333',
        blockNumber: 18000003,
        memberAddress,
        tokenAddress,
        escrowAddress: '0xescrow3333333333333333333333333333333333',
        nftAddress: lockTokenAddress,
        lockWithdraw: {
          status: true,
        },
      }
      await Models.Lock.create(lock3Data)

      const result = await Models.Lock.findWithPagination({
        extraParams: {
          memberAddress,
          onlyActive: true,
        },
        paginationParams: {
          pageSize: 10,
          page: 1,
          order: 'desc',
          sort: 'blockNumber',
        },
      })

      expect(result.data).to.have.length(2)
      expect(result.metadata.totalRecords).to.eq(2)
      expect(result.metadata.totalPages).to.eq(1)
      expect(result.metadata.page).to.eq(1)

      const lockIds = result.data.map((lock: any) => lock.id)
      expect(lockIds).to.include(lock1.id)
      expect(lockIds).to.include(lock2.id)

      // test sort
      expect(result.data[0].blockNumber).to.eq(18000002)
      expect(result.data[1].blockNumber).to.eq(18000001)
    })
  })

  describe('getMembersOfVeLockPlugin', () => {
    let tokenAddress: string
    let pluginAddress: string
    let network: NetworksEnum
    let settings: any

    beforeEach(async () => {
      tokenAddress = fakeToken.address!
      pluginAddress = '0xPluginAddress1234567890abcdef1234567890'
      network = NetworksEnum.ethereumMainnet
      settings = {
        currentTime: 1640995200,
        maxTime: '31536000', // 1 year in seconds
        decimals: '1000000000000000000', // 1e18
        bias: '1000000000000000000', // 1e18
        slope: '500000000000000000', // 0.5e18
      }

      // Create members for testing
      await Models.Member.create({
        id: 'member-active1',
        address: '0xActive1234567890abcdef1234567890abcdef',
        ens: 'active1.eth',
        avatar: 'avatar1.png',
      })

      await Models.Member.create({
        id: 'member-active2',
        address: '0xActive2234567890abcdef1234567890abcdef',
        ens: 'active2.eth',
        avatar: 'avatar2.png',
      })

      await Models.Member.create({
        id: 'member-inactive',
        address: '0xInactive234567890abcdef1234567890abcdef',
        ens: 'inactive.eth',
        avatar: 'avatar3.png',
      })
    })

    it('should return paginated members with voting power', async () => {
      // Create active locks
      await Models.Lock.create({
        ...rawLock,
        id: 'lock-active-1',
        transactionHash: '0xactive1111111111111111111111111111111111',
        tokenId: 101,
        memberAddress: '0xActive1234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '1000000000000000000', // 1 token
        epochStartAt: 1640995100, // 100 seconds ago
        lockExit: { status: false },
      })

      await Models.Lock.create({
        ...rawLock,
        id: 'lock-active-2',
        transactionHash: '0xactive2222222222222222222222222222222222',
        tokenId: 102,
        memberAddress: '0xActive2234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '2000000000000000000', // 2 tokens
        epochStartAt: 1640995000, // 200 seconds ago
        lockExit: { status: false },
      })

      // Create inactive lock (exited) - this should be filtered out
      await Models.Lock.create({
        ...rawLock,
        id: 'lock-inactive',
        transactionHash: '0xinactive333333333333333333333333333333',
        tokenId: 103,
        memberAddress: '0xInactive234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '1500000000000000000', // 1.5 tokens
        epochStartAt: 1640995050,
        lockExit: { status: true }, // This lock is exited
      })

      // Create member balances that match the locks
      await Models.MemberBalance.create({
        network,
        address: '0xActive1234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '1000000000000000000',
        tokenIds: [101], // Must match the tokenId from the lock
        votingPower: '0',
      })

      await Models.MemberBalance.create({
        network,
        address: '0xActive2234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '2000000000000000000',
        tokenIds: [102], // Must match the tokenId from the lock
        votingPower: '0',
      })

      // Don't create member balance for inactive member to ensure it's filtered out

      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'votingPower',
      }

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams,
      })

      expect(response).to.have.property('data')
      expect(response.data).to.have.length(2) // Only members with current balances should be included
      expect(response.metadata.totalRecords).to.eq(2)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)

      // Check that returned data has correct structure
      const member1 = response.data.find((m: any) => m.address === '0xActive1234567890abcdef1234567890abcdef')
      const member2 = response.data.find((m: any) => m.address === '0xActive2234567890abcdef1234567890abcdef')

      expect(member1).to.exist
      expect(member1.ens).to.eq('active1.eth')
      expect(member1.votingPower).to.be.a('string')
      expect(member1.memberMetrics).to.exist

      expect(member2).to.exist
      expect(member2.ens).to.eq('active2.eth')
      expect(member2.votingPower).to.be.a('string')
      expect(member2.memberMetrics).to.exist
    })

    it('should handle pagination correctly with multiple pages', async () => {
      // Create 15 active locks with different voting powers
      const members: any = []
      const locks: any = []
      const balances: any = []

      for (let i = 0; i < 15; i++) {
        const memberAddress = `0xMember${i.toString().padStart(36, '0')}`
        const tokenId = 200 + i

        // Create member
        const member = {
          id: `member-${i}`,
          address: memberAddress,
          ens: `member${i}.eth`,
          avatar: 'avatar.png',
        }
        members.push(member)

        // Create lock
        const lock = {
          ...rawLock,
          id: `lock-${i}`,
          transactionHash: `0x${i.toString().padStart(40, '0')}`,
          tokenId,
          memberAddress,
          tokenAddress,
          amount: `${(i + 1) * 1000000000000000000}`, // Different amounts
          epochStartAt: 1640995200 - i * 10, // Different start times
          lockExit: { status: false },
        }
        locks.push(lock)

        // Create member balance that references the lock's tokenId
        const balance = {
          network,
          address: memberAddress,
          tokenAddress,
          amount: `${(i + 1) * 1000000000000000000}`,
          tokenIds: [tokenId], // This is crucial - must match lock's tokenId
          votingPower: '0',
        }
        balances.push(balance)
      }

      // Create all test data
      for (const member of members) {
        await Models.Member.create(member)
      }
      for (const lock of locks) {
        await Models.Lock.create(lock)
      }
      for (const balance of balances) {
        await Models.MemberBalance.create(balance)
      }

      // Test first page
      const page1Response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 5,
          page: 1,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(page1Response.data).to.have.length(5)
      expect(page1Response.metadata.page).to.eq(1)
      expect(page1Response.metadata.pageSize).to.eq(5)
      expect(page1Response.metadata.totalRecords).to.eq(15)
      expect(page1Response.metadata.totalPages).to.eq(3)

      // Test second page
      const page2Response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 5,
          page: 2,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(page2Response.data).to.have.length(5)
      expect(page2Response.metadata.page).to.eq(2)

      // Test third page
      const page3Response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 5,
          page: 3,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(page3Response.data).to.have.length(5)
      expect(page3Response.metadata.page).to.eq(3)
    })

    it('should return empty response when page exceeds total pages', async () => {
      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 10,
          page: 999, // Very high page number
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should exclude inactive locks from results', async () => {
      // Create one active lock with a member balance
      await Models.Lock.create({
        ...rawLock,
        id: 'lock-active-test',
        transactionHash: '0xactivetest111111111111111111111111111111',
        tokenId: 301,
        memberAddress: '0xActive1234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '1000000000000000000',
        epochStartAt: 1640995100,
        lockExit: { status: false }, // Active
      })

      // Create inactive lock (exited)
      await Models.Lock.create({
        ...rawLock,
        id: 'lock-inactive-test',
        transactionHash: '0xinactivetest222222222222222222222222222',
        tokenId: 302,
        memberAddress: '0xInactive234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '2000000000000000000',
        epochStartAt: 1640995100,
        lockExit: { status: true }, // Inactive (exited)
      })

      // Only create member balance for the active member
      await Models.MemberBalance.create({
        network,
        address: '0xActive1234567890abcdef1234567890abcdef',
        tokenAddress,
        amount: '1000000000000000000',
        tokenIds: [301], // Only active lock's tokenId
        votingPower: '0',
      })

      // Don't create member balance for inactive member - this simulates that
      // when a lock is exited, the NFT is burned and removed from member balance

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 10,
          page: 1,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(response.data).to.have.length(1)
      expect(response.data[0].address).to.eq('0xActive1234567890abcdef1234567890abcdef')
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should handle members with multiple locks correctly', async () => {
      const memberAddress = '0xMultiLock4567890abcdef1234567890abcdef'

      // Create member
      await Models.Member.create({
        id: 'member-multilock',
        address: memberAddress,
        ens: 'multilock.eth',
        avatar: 'avatar.png',
      })

      // Create multiple active locks for the same member
      await Models.Lock.create({
        ...rawLock,
        id: 'lock-multi-1',
        transactionHash: '0xmulti1111111111111111111111111111111111',
        tokenId: 401,
        memberAddress,
        tokenAddress,
        amount: '1000000000000000000',
        epochStartAt: 1640995100,
        lockExit: { status: false },
      })

      await Models.Lock.create({
        ...rawLock,
        id: 'lock-multi-2',
        transactionHash: '0xmulti2222222222222222222222222222222222',
        tokenId: 402,
        memberAddress,
        tokenAddress,
        amount: '2000000000000000000',
        epochStartAt: 1640995050,
        lockExit: { status: false },
      })

      // Create member balance with multiple token IDs
      await Models.MemberBalance.create({
        network,
        address: memberAddress,
        tokenAddress,
        amount: '3000000000000000000', // Sum of both locks
        tokenIds: [401, 402], // Both lock tokenIds
        votingPower: '0',
      })

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 10,
          page: 1,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(response.data).to.have.length(1)
      expect(response.data[0].address).to.eq(memberAddress)
      expect(response.data[0].ens).to.eq('multilock.eth')
      expect(response.metadata.totalRecords).to.eq(1)

      // The voting power should be the sum of both locks
      expect(response.data[0].votingPower).to.be.a('string')
      expect(parseFloat(response.data[0].votingPower)).to.be.greaterThan(0)
    })

    it('should return empty result when no locks match criteria', async () => {
      // Use a completely different token address that has no locks or balances
      const nonExistentTokenAddress = '0xNonExistentToken1234567890abcdef123456'

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress: nonExistentTokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 10,
          page: 1,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(response.data).to.have.length(0)
      expect(response.metadata.totalRecords).to.eq(0)
      expect(response.metadata.totalPages).to.eq(1)
    })

    it('should calculate voting power based on time and amount', async () => {
      const memberAddress = '0xVotingPower567890abcdef1234567890abcdef'

      await Models.Member.create({
        id: 'member-voting-power',
        address: memberAddress,
        ens: 'votingpower.eth',
        avatar: 'avatar.png',
      })

      await Models.Lock.create({
        ...rawLock,
        id: 'lock-voting-power',
        transactionHash: '0xvotingpower11111111111111111111111111111',
        tokenId: 501,
        memberAddress,
        tokenAddress,
        amount: '1000000000000000000', // 1 token
        epochStartAt: 1640995100, // 100 seconds before current time
        lockExit: { status: false },
      })

      await Models.MemberBalance.create({
        network,
        address: memberAddress,
        tokenAddress,
        amount: '1000000000000000000',
        tokenIds: [501],
        votingPower: '0',
      })

      const response = await Models.Lock.getMembersOfVeLockPlugin({
        tokenAddress,
        pluginAddress,
        network,
        settings,
        paginationParams: {
          pageSize: 10,
          page: 1,
          order: 'desc',
          sort: 'votingPower',
        },
      })

      expect(response.data).to.have.length(1)
      expect(response.data[0].votingPower).to.be.a('string')

      const votingPower = parseFloat(response.data[0].votingPower)
      expect(votingPower).to.be.greaterThan(0)
    })
  })
})
