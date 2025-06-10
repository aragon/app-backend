import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberBalance from '@models/schema/memberBalance'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { fakeMemberBalance } from '@test/mock/fakeMemberBalance'
import ModelUtils from '@models/utils/models'

describe('Model: MemberBalance', () => {
  let sandbox: SinonSandbox
  let rawMemberBalance: Partial<MemberBalance>
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberBalance = {
      ...fakeMemberBalance,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member balance', () => {
    it('should create new entry of member balance', async () => {
      const entityId = Models.MemberBalance.getEntityId({
        network: rawMemberBalance.network!,
        address: rawMemberBalance.address!,
        tokenAddress: rawMemberBalance.tokenAddress!,
      })

      const memberBalance = await Models.MemberBalance.create(rawMemberBalance)
      expect(memberBalance.id).to.eq(entityId)

      expect(memberBalance.network).to.eq(rawMemberBalance.network)
      expect(memberBalance.address).to.eq(rawMemberBalance.address)
      expect(memberBalance.tokenAddress).to.eq(rawMemberBalance.tokenAddress)
    })

    it('should save without asset if id present', async () => {
      const entityId = Models.MemberBalance.getEntityId({
        network: rawMemberBalance.network!,
        address: rawMemberBalance.address!,
        tokenAddress: rawMemberBalance.tokenAddress!,
      })

      rawMemberBalance.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.MemberBalance, 'getEntityId')
      await Models.MemberBalance.create(rawMemberBalance)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when token address is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          network: rawMemberBalance.network,
          address: rawMemberBalance.address,
        }),
      ).to.be.rejectedWith('tokenAddress is required')
    })

    it('should fail when network is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          tokenAddress: rawMemberBalance.tokenAddress,
          address: rawMemberBalance.address,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should fail when address is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          tokenAddress: rawMemberBalance.tokenAddress,
          network: rawMemberBalance.network,
        }),
      ).to.be.rejectedWith('memberAddress is required')
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.MemberBalance.getEntityId({
      network: rawMemberBalance.network!,
      address: rawMemberBalance.address!,
      tokenAddress: rawMemberBalance.tokenAddress!,
    })
    const memberDb = await Models.MemberBalance.create(rawMemberBalance)
    expect(entityId).to.eq(memberDb.id)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    const foundLogDao = await Models.MemberBalance.findExistingLog({
      network: createdLogDao.network!,
      address: createdLogDao.address!,
      tokenAddress: createdLogDao.tokenAddress!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    const foundLogDao = await Models.MemberBalance.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByAddress', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await Models.MemberBalance.findByAddress(createdMember.tokenAddress, createdMember.network)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should update Member', async () => {
    const member = await Models.MemberBalance.create(rawMemberBalance)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawMemberBalance.address)
  })

  it('should increase the balance', async () => {
    rawMemberBalance.amount = '0'
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await createdMember.increaseBalance({ amount: '1000', blockNumber: 1232323, tokenId: 1 })
    expect(member?.amount).to.eq('1000')
    expect(member?.tokenIds.length).to.eq(1)
    expect(member?.tokenIds[0]).to.eq(1)
  })

  describe('increaseBalance', () => {
    it('should decrease the balance', async () => {
      rawMemberBalance.amount = '1000'
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.decreaseBalance({ amount: '1000', blockNumber: 1232323, tokenId: 1 })
      expect(member?.amount).to.eq('0')
      expect(member?.tokenIds.length).to.eq(0)
    })

    it('should not decrease the balance if current balance is less than decrement', async () => {
      rawMemberBalance.amount = '1000'
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.decreaseBalance({ amount: '1001', blockNumber: 1232323 })
      expect(member?.amount).to.eq('1000')
      expect(member?.tokenIds.length).to.eq(0)
    })
  })

  describe('updateBalance', () => {
    it('should update the balance to the specified amount', async () => {
      rawMemberBalance.amount = '1000'
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.updateBalance({ amount: '2500', blockNumber: 1232323 })
      expect(member?.amount).to.eq('2500')
      expect(member?.lastSyncAmountBlockNumber).to.eq(1232323)
    })

    it('should update the balance and remove tokenId if provided', async () => {
      rawMemberBalance.amount = '1000'
      rawMemberBalance.tokenIds = [1, 2, 3]
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.updateBalance({ amount: '1500', blockNumber: 1232323, tokenId: 2 })
      expect(member?.amount).to.eq('1500')
      expect(member?.tokenIds.length).to.eq(2)
      expect(member?.tokenIds).to.not.include(2)
      expect(member?.tokenIds).to.include(1)
      expect(member?.tokenIds).to.include(3)
    })

    it('should update the balance without affecting tokenIds if tokenId not provided', async () => {
      rawMemberBalance.amount = '1000'
      rawMemberBalance.tokenIds = [1, 2, 3]
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.updateBalance({ amount: '800', blockNumber: 1232323 })
      expect(member?.amount).to.eq('800')
      expect(member?.tokenIds.length).to.eq(3)
      expect(member?.tokenIds).to.deep.equal([1, 2, 3])
    })

    it('should handle tokenId that does not exist in tokenIds array', async () => {
      rawMemberBalance.amount = '1000'
      rawMemberBalance.tokenIds = [1, 2, 3]
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.updateBalance({ amount: '1200', blockNumber: 1232323, tokenId: 5 })
      expect(member?.amount).to.eq('1200')
      expect(member?.tokenIds.length).to.eq(3)
      expect(member?.tokenIds).to.deep.equal([1, 2, 3])
    })
  })

  it('should updateVotingPower', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await createdMember.updateVotingPower('1000', 1232323)
    expect(member?.votingPower).to.eq('1000')
  })

  it('should find by findByAddressAndToken', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await Models.MemberBalance.findByAddressAndToken({
      address: createdMember.address,
      tokenAddress: createdMember.tokenAddress,
      network: createdMember.network,
    })
    expect(member?.address).to.eq(createdMember.address)
  })

  describe('pagination', () => {
    let rawMemberBalance: Partial<MemberBalance>

    beforeEach(async () => {
      rawMemberBalance = {
        ...fakeMemberBalance,
      }

      await Models.MemberBalance.create(rawMemberBalance)

      // Create a Member entity that can be joined with MemberBalance
      await Models.Member.create({
        id: `member-${rawMemberBalance.address}`,
        address: rawMemberBalance.address,
        ens: 'testuser.eth',
        avatar: 'avatar.png',
      })
    })

    it('should find and paginate member balances with tokenAddress filter', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawMemberBalance.tokenAddress,
        network: rawMemberBalance.network,
        pluginAddress: '0xPluginAddress',
      }

      const aggregateSpy = sandbox.spy(Models.MemberBalance, 'aggregate')

      const response = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMemberBalance.address)
      expect(response.data[0]).to.have.property('ens')
      expect(response.data[0]).to.have.property('tokenBalance')
      expect(response.data[0]).to.have.property('votingPower')
      expect(response.data[0]).to.have.property('metrics')
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should return empty array if no member is found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: '0xNonExistentToken',
      }

      const response = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(0)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should apply search filter correctly', async () => {
      // Create another member and member balance with searchable term
      const searchableMember = {
        id: 'searchable-member',
        address: '0xSearchableAddress',
        ens: 'searchableuser.eth',
        avatar: 'avatar.png',
      }

      const searchableMemberBalance = {
        ...rawMemberBalance,
        id: 'searchable-balance',
        address: searchableMember.address,
        tokenAddress: rawMemberBalance.tokenAddress,
        amount: '2000',
        votingPower: '1500',
      }

      await Models.Member.create(searchableMember)
      await Models.MemberBalance.create(searchableMemberBalance)

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawMemberBalance.tokenAddress,
        network: rawMemberBalance.network,
      }

      const response = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(searchableMember.address)
      expect(response.data[0].ens).to.eq(searchableMember.ens)
      expect(response.data[0].tokenBalance).to.eq(searchableMemberBalance.amount)
      expect(response.data[0].votingPower).to.eq(searchableMemberBalance.votingPower)
    })

    it('should return correct page size', async () => {
      // Create 15 additional members and member balances
      const members: any = []
      const balances: any = []

      for (let i = 0; i < 15; i++) {
        const member = {
          id: `member-${i}`,
          address: `0xAddress${i}`,
          ens: `user${i}.eth`,
          avatar: 'avatar.png',
        }

        const balance = {
          ...rawMemberBalance,
          id: `balance-${i}`,
          address: member.address,
          tokenAddress: rawMemberBalance.tokenAddress,
          amount: `${1000 + i}`,
          votingPower: `${500 + i}`,
        }

        members.push(member)
        balances.push(balance)
      }

      for (const member of members) {
        await Models.Member.create(member)
      }

      for (const balance of balances) {
        await Models.MemberBalance.create(balance)
      }

      const paginationParams = {
        search: '',
        pageSize: 5,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawMemberBalance.tokenAddress,
        network: rawMemberBalance.network,
      }

      const response = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(5)
      expect(response.metadata.pageSize).to.eq(5)
      expect(response.metadata.totalRecords).to.eq(16) // 15 new + 1 from beforeEach
      expect(response.metadata.totalPages).to.eq(4) // ceil(16/5) = 4

      // Check second page
      const page2Response = await Models.MemberBalance.findAndPaginate({
        paginationParams: { ...paginationParams, page: 2 },
        extraParams,
      })

      expect(page2Response).to.have.property('data').with.lengthOf(5)
      expect(page2Response.metadata.page).to.eq(2)
    })

    it('should return empty response when page exceeds total pages', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 999, // Very high page number
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawMemberBalance.tokenAddress,
        network: rawMemberBalance.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should sort results correctly', async () => {
      // Create two additional members and member balances with specific dates
      const memberEarly = {
        id: 'member-early',
        address: '0xAddressEarly',
        ens: 'earlyuser.eth',
        avatar: 'avatar.png',
        createdAt: new Date('2023-01-01'),
      }

      const memberLate = {
        id: 'member-late',
        address: '0xAddressLate',
        ens: 'lateuser.eth',
        avatar: 'avatar.png',
        createdAt: new Date('2023-02-01'),
      }

      const balanceEarly = {
        ...rawMemberBalance,
        id: 'balance-early',
        address: memberEarly.address,
        tokenAddress: rawMemberBalance.tokenAddress,
        amount: '1000',
        votingPower: '500',
        createdAt: new Date('2023-01-01'),
      }

      const balanceLate = {
        ...rawMemberBalance,
        id: 'balance-late',
        address: memberLate.address,
        tokenAddress: rawMemberBalance.tokenAddress,
        amount: '2000',
        votingPower: '1000',
        createdAt: new Date('2023-02-01'),
      }

      await Models.Member.create(memberEarly)
      await Models.Member.create(memberLate)
      await Models.MemberBalance.create(balanceEarly)
      await Models.MemberBalance.create(balanceLate)

      // Test ascending sort
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawMemberBalance.tokenAddress,
        network: rawMemberBalance.network,
      }

      const ascResponse = await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(ascResponse.data[0].address).to.eq(memberEarly.address)
      expect(ascResponse.data[1].address).to.eq(memberLate.address)
      expect(ascResponse.data[2].address).to.eq(rawMemberBalance.address)

      // Test descending sort
      const descParams = {
        ...paginationParams,
        order: 'desc',
      }

      const descResponse = await Models.MemberBalance.findAndPaginate({
        paginationParams: descParams,
        extraParams,
      })

      expect(descResponse.data[0].address).to.eq(rawMemberBalance.address)
      expect(descResponse.data[1].address).to.eq(memberLate.address)
      expect(descResponse.data[2].address).to.eq(memberEarly.address)
    })
  })
})
