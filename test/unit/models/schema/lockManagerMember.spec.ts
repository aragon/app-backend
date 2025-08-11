import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import LockManagerMember from '@models/schema/lockManagerMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: LockManagerMember', () => {
  let sandbox: SinonSandbox
  let rawLockManagerMember: Partial<LockManagerMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLockManagerMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      lockManagerAddress: '0xA23456789012345678901234567890123456789B',
      network: NetworksEnum.ethereumMainnet,
      votingPower: '1000000000000000000',
      lastVPBlockNumber: 12345,
    }
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up database to prevent duplicate key errors
    await Models.LockManagerMember.deleteMany({})
    await Models.Member.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.PluginMetrics.deleteMany({})
  })

  it('Should create LockManagerMember', async () => {
    const entityId = Models.LockManagerMember.getEntityId({
      network: rawLockManagerMember.network!,
      memberAddress: rawLockManagerMember.memberAddress!,
      lockManagerAddress: rawLockManagerMember.lockManagerAddress!,
    })
    const lockManagerMember = await Models.LockManagerMember.create(rawLockManagerMember)
    expect(lockManagerMember.id).to.eq(entityId)
    expect(lockManagerMember.memberAddress).to.eq(rawLockManagerMember.memberAddress)
    expect(lockManagerMember.lockManagerAddress).to.eq(rawLockManagerMember.lockManagerAddress)
    expect(lockManagerMember.network).to.eq(rawLockManagerMember.network)
    expect(lockManagerMember.votingPower).to.eq(rawLockManagerMember.votingPower)
    expect(lockManagerMember.lastVPBlockNumber).to.eq(rawLockManagerMember.lastVPBlockNumber)
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      memberAddress: '0xMember',
      lockManagerAddress: '0xLockManager',
    }
    const entityId = Models.LockManagerMember.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.lockManagerAddress}-${params.memberAddress}`)
  })

  it('Should findByEntityId', async () => {
    const createdLockManagerMember = await Models.LockManagerMember.create(rawLockManagerMember)
    const foundLockManagerMember = await Models.LockManagerMember.findByEntityId(createdLockManagerMember.id)
    expect(foundLockManagerMember?.id).to.eq(createdLockManagerMember.id)
  })

  it('should findMemberByLockManager', async () => {
    const createdLockManagerMember = await Models.LockManagerMember.create(rawLockManagerMember)
    const lockManagerMember = await Models.LockManagerMember.findMemberByLockManager({
      network: rawLockManagerMember.network!,
      lockManagerAddress: rawLockManagerMember.lockManagerAddress!,
      memberAddress: rawLockManagerMember.memberAddress!,
    })
    expect(lockManagerMember?.id).to.eq(createdLockManagerMember.id)
  })

  it('should findActiveMembers', async () => {
    // Create two members, one active and one inactive
    const activeMember = {
      ...rawLockManagerMember,
      memberAddress: '0x1111111111111111111111111111111111111111',
      votingPower: '1000000000000000000',
    }
    const inactiveMember = {
      ...rawLockManagerMember,
      memberAddress: '0x2222222222222222222222222222222222222222',
      votingPower: '0',
    }

    await Models.LockManagerMember.create(activeMember)
    await Models.LockManagerMember.create(inactiveMember)

    const activeMembers = await Models.LockManagerMember.findActiveMembers({
      network: rawLockManagerMember.network!,
      lockManagerAddress: rawLockManagerMember.lockManagerAddress!,
    })

    expect(activeMembers).to.have.lengthOf(1)
    expect(activeMembers[0].memberAddress).to.eq(activeMember.memberAddress)
    expect(activeMembers[0].votingPower).to.not.eq('0')
  })

  it('should update LockManagerMember', async () => {
    const lockManagerMember = await Models.LockManagerMember.create(rawLockManagerMember)
    const newVotingPower = '2000000000000000000'
    const newLastVPBlockNumber = 12346

    const updatedLockManagerMember = await lockManagerMember.update({
      votingPower: newVotingPower,
      lastVPBlockNumber: newLastVPBlockNumber,
    })

    expect(updatedLockManagerMember.votingPower).to.eq(newVotingPower)
    expect(updatedLockManagerMember.lastVPBlockNumber).to.eq(newLastVPBlockNumber)
  })

  it('Should reload', async () => {
    const createdLockManagerMember = await Models.LockManagerMember.create(rawLockManagerMember)
    await createdLockManagerMember.reload()

    expect(createdLockManagerMember.memberAddress).to.eq(rawLockManagerMember.memberAddress)
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Clean up before creating test data
      await Models.LockManagerMember.deleteMany({})
      await Models.Member.deleteMany({})
      await Models.Plugin.deleteMany({})
      await Models.PluginMetrics.deleteMany({})

      // Create a member first
      await Models.Member.create({
        address: rawLockManagerMember.memberAddress,
        ens: 'test.eth',
        avatar: 'avatar.png',
      })

      // No need to create plugin for LockManagerMember as it doesn't have pluginAddress

      await Models.LockManagerMember.create(rawLockManagerMember)
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
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
      }

      const aggregateSpy = sandbox.spy(Models.LockManagerMember, 'aggregate')

      const result = await Models.LockManagerMember.findAndPaginate({
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
      expect(member.address).to.eq(rawLockManagerMember.memberAddress)
      expect(member.votingPower).to.eq(parseFloat(rawLockManagerMember.votingPower!))
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
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const result = await Models.LockManagerMember.findAndPaginate({
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
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
      }

      const result = await Models.LockManagerMember.findAndPaginate({
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
      await Models.LockManagerMember.deleteMany({})
      await Models.Member.deleteMany({})

      // Create multiple members with different voting powers
      const member1 = {
        memberAddress: '0x1111111111111111111111111111111111111111',
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
        votingPower: '1000000000000000000',
        lastVPBlockNumber: 12345,
      }
      const member2 = {
        memberAddress: '0x3333333333333333333333333333333333333333',
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
        votingPower: '500000000000000000',
        lastVPBlockNumber: 12345,
      }
      const member3 = {
        memberAddress: '0x4444444444444444444444444444444444444444',
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
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

      await Models.LockManagerMember.create(member1)
      await Models.LockManagerMember.create(member2)
      await Models.LockManagerMember.create(member3)

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'desc',
        sort: 'votingPower',
      }

      const extraParams = {
        lockManagerAddress: rawLockManagerMember.lockManagerAddress,
        network: rawLockManagerMember.network,
      }

      const result = await Models.LockManagerMember.findAndPaginate({
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
