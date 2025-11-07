import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import LockToVoteMember from '@models/schema/lockToVoteMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: LockToVoteMember', () => {
  let sandbox: SinonSandbox
  let rawLockToVoteMember: Partial<LockToVoteMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLockToVoteMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      lockManagerAddress: '0xA23456789012345678901234567890123456789B',
      network: NetworksEnum.ethereumMainnet,
      votingPower: '1000000000000000000',
      lastVPBlockNumber: 12345,
    }
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('Should create LockToVoteMember', async () => {
    const entityId = Models.LockToVoteMember.getEntityId({
      network: rawLockToVoteMember.network!,
      memberAddress: rawLockToVoteMember.memberAddress!,
      lockManagerAddress: rawLockToVoteMember.lockManagerAddress!,
    })
    const lockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    expect(lockToVoteMember.id).to.eq(entityId)
    expect(lockToVoteMember.memberAddress).to.eq(rawLockToVoteMember.memberAddress)
    expect(lockToVoteMember.lockManagerAddress).to.eq(rawLockToVoteMember.lockManagerAddress)
    expect(lockToVoteMember.network).to.eq(rawLockToVoteMember.network)
    expect(lockToVoteMember.votingPower).to.eq(rawLockToVoteMember.votingPower)
    expect(lockToVoteMember.lastVPBlockNumber).to.eq(rawLockToVoteMember.lastVPBlockNumber)
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      memberAddress: '0xMember',
      lockManagerAddress: '0xLockManager',
    }
    const entityId = Models.LockToVoteMember.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.lockManagerAddress}-${params.memberAddress}`)
  })

  it('Should findByEntityId', async () => {
    const createdLockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    const foundLockToVoteMember = await Models.LockToVoteMember.findByEntityId(createdLockToVoteMember.id)
    expect(foundLockToVoteMember?.id).to.eq(createdLockToVoteMember.id)
  })

  it('should findMemberByLockManager', async () => {
    const createdLockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    const lockToVoteMember = await Models.LockToVoteMember.findMemberByLockManager({
      network: rawLockToVoteMember.network!,
      lockManagerAddress: rawLockToVoteMember.lockManagerAddress!,
      memberAddress: rawLockToVoteMember.memberAddress!,
    })
    expect(lockToVoteMember?.id).to.eq(createdLockToVoteMember.id)
  })

  it('should findActiveMembers', async () => {
    // Create two members, one active and one inactive
    const activeMember = {
      ...rawLockToVoteMember,
      memberAddress: '0x1111111111111111111111111111111111111111',
      votingPower: '1000000000000000000',
    }
    const inactiveMember = {
      ...rawLockToVoteMember,
      memberAddress: '0x2222222222222222222222222222222222222222',
      votingPower: '0',
    }

    await Models.LockToVoteMember.create(activeMember)
    await Models.LockToVoteMember.create(inactiveMember)

    const activeMembers = await Models.LockToVoteMember.findActiveMembers({
      network: rawLockToVoteMember.network!,
      lockManagerAddress: rawLockToVoteMember.lockManagerAddress!,
    })

    expect(activeMembers).to.have.lengthOf(1)
    expect(activeMembers[0].memberAddress).to.eq(activeMember.memberAddress)
    expect(activeMembers[0].votingPower).to.not.eq('0')
  })

  it('should update LockToVoteMember', async () => {
    const lockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    const newVotingPower = '2000000000000000000'
    const newLastVPBlockNumber = 12346

    const updatedLockToVoteMember = await lockToVoteMember.update({
      votingPower: newVotingPower,
      lastVPBlockNumber: newLastVPBlockNumber,
    })

    expect(updatedLockToVoteMember.votingPower).to.eq(newVotingPower)
    expect(updatedLockToVoteMember.lastVPBlockNumber).to.eq(newLastVPBlockNumber)
  })

  it('Should not update required field with falsy value', async () => {
    const lockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    const originalMemberAddress = lockToVoteMember.memberAddress

    // Try to update required field with null - should not update
    await lockToVoteMember.update({
      memberAddress: null as any,
    })

    expect(lockToVoteMember.memberAddress).to.eq(originalMemberAddress)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const lockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)

    // Try to update with non-existent field
    await lockToVoteMember.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(lockToVoteMember).to.exist
  })

  it('Should not update when value is same as current', async () => {
    const lockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    const originalVotingPower = lockToVoteMember.votingPower

    // Update with same value
    await lockToVoteMember.update({
      votingPower: originalVotingPower,
    })

    expect(lockToVoteMember.votingPower).to.eq(originalVotingPower)
  })

  it('Should reload', async () => {
    const createdLockToVoteMember = await Models.LockToVoteMember.create(rawLockToVoteMember)
    await createdLockToVoteMember.reload()

    expect(createdLockToVoteMember.memberAddress).to.eq(rawLockToVoteMember.memberAddress)
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Create a member first
      await Models.Member.create({
        address: rawLockToVoteMember.memberAddress,
        ens: 'test.eth',
        avatar: 'avatar.png',
      })

      // No need to create plugin for LockToVoteMember as it doesn't have pluginAddress
      await Models.LockToVoteMember.create(rawLockToVoteMember)
    })

    it('should find and paginate lock manager members with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
      }

      const aggregateSpy = sandbox.spy(Models.LockToVoteMember, 'aggregate')

      const result = await Models.LockToVoteMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.called).to.be.true
      expect(result.metadata).to.exist
      expect(result.metadata.pageSize).to.eq(10)
      expect(result.metadata.page).to.eq(1)
      expect(result.data).to.be.an('array')
      expect(result.data.length).to.be.greaterThan(0)

      const member = result.data[0]
      expect(member.address).to.eq(rawLockToVoteMember.memberAddress)
      expect(member.votingPower).to.eq(rawLockToVoteMember.votingPower)
      expect(member.ens).to.eq('test.eth')
      expect(member.avatar).to.eq('avatar.png')
    })

    it('should find and paginate with empty result', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 100, // High page number to get empty results
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const result = await Models.LockToVoteMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(paginateEmptyResponseSpy.called).to.be.true
      expect(result.metadata).to.exist
      expect(result.metadata.pageSize).to.eq(10)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.data).to.be.an('array')
      expect(result.data.length).to.eq(0)
    })

    it('should find and paginate with search filter', async () => {
      const paginationParams = {
        search: 'test.eth',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
      }

      const result = await Models.LockToVoteMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(result.data).to.be.an('array')
      expect(result.data.length).to.be.greaterThan(0)
      const member = result.data[0]
      expect(member.ens).to.include('test.eth')
    })

    it('should sort by voting power descending', async () => {
      // Clean up to avoid duplicate key errors
      await Models.LockToVoteMember.deleteMany({})
      await Models.Member.deleteMany({})

      // Create multiple members with different voting powers
      const member1 = {
        memberAddress: '0x1111111111111111111111111111111111111111',
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
        votingPower: '1000000000000000000',
        lastVPBlockNumber: 12345,
      }
      const member2 = {
        memberAddress: '0x3333333333333333333333333333333333333333',
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
        votingPower: '500000000000000000',
        lastVPBlockNumber: 12345,
      }
      const member3 = {
        memberAddress: '0x4444444444444444444444444444444444444444',
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
        votingPower: '2000000000000000000',
        lastVPBlockNumber: 12345,
      }

      await Models.Member.create({
        address: member1.memberAddress,
        ens: 'member1.eth',
      })
      await Models.Member.create({
        address: member2.memberAddress,
        ens: 'member2.eth',
      })
      await Models.Member.create({
        address: member3.memberAddress,
        ens: 'member3.eth',
      })

      await Models.LockToVoteMember.create(member1)
      await Models.LockToVoteMember.create(member2)
      await Models.LockToVoteMember.create(member3)

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'votingPower',
      }

      const extraParams = {
        lockManagerAddress: rawLockToVoteMember.lockManagerAddress,
        network: rawLockToVoteMember.network,
      }

      const result = await Models.LockToVoteMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(result.data).to.be.an('array')
      expect(result.data.length).to.eq(3)

      // Check that members are sorted by voting power descending
      const votingPowers = result.data.map(m => parseFloat(m.votingPower))
      expect(votingPowers[0]).to.be.greaterThan(votingPowers[1])
      expect(votingPowers[1]).to.be.greaterThan(votingPowers[2])
    })
  })
})
