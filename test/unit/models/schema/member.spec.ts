import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Member from '@models/schema/member'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeMember } from '@test/mock/fakeMember'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import Plugin from '@models/schema/plugin'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { FakeMemberMetrics } from '@test/mock/fakeMemberMetrics'
import { fakeMemberBalance } from '@test/mock/fakeMemberBalance'

import { PluginList } from '@test/mock/fakePlugins'
import MemberBalance from '@models/schema/memberBalance'
import MemberMetrics from '@models/schema/memberMetrics'
import { IPluginInterfaceType } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawDaoMapping: Partial<DaoMemberMapping>
  let rawPlugin: Partial<Plugin>
  let rawMemberBalance: Partial<MemberBalance>
  let rawMemberMetrics: Partial<MemberMetrics>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      ...FakeMember,
    } as any

    rawDaoMapping = {
      ...FakeDaoMemberMappings[0],
      memberAddress: rawMember.address,
    }

    rawPlugin = {
      ...PluginList[0],
      daoAddress: rawDaoMapping.daoAddress,
      interfaceType: IPluginInterfaceType.multisig,
    } as any

    rawMemberBalance = {
      ...fakeMemberBalance,
      address: FakeMember.address,
      tokenAddress: rawPlugin.tokenAddress,
    }

    rawMemberMetrics = {
      ...FakeMemberMetrics,
      address: rawMember.address,
      pluginAddress: rawPlugin.address,
    }

    await Models.MemberBalance.create(rawMemberBalance)
    await Models.DaoMemberMapping.create(rawDaoMapping)
    await Models.Plugin.create(rawPlugin)
    await Models.MemberMetrics.create(rawMemberMetrics)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Member', async () => {
    const entityId = Models.Member.getEntityId({ address: rawMember.address! })
    const member = await Models.Member.create(rawMember)
    expect(member.id).to.eq(entityId)
    expect(member.address).to.eq(rawMember.address)
    expect(member.ens).to.eq(rawMember.ens)
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const entityId = Models.Member.getEntityId({ address })
    expect(entityId).to.eq(`${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findExistingLog({
      address: createdLogDao.address!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEns', async () => {
    const createdMember = await Models.Member.create(rawMember)
    const member = await Models.Member.findByEns(createdMember.ens)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should findByAddress', async () => {
    const createdMember = await Models.Member.create(rawMember)
    const member = await Models.Member.findByAddress(createdMember.address)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should update Member', async () => {
    const member = await Models.Member.create(rawMember)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdMember = await Models.Member.create(rawMember)
    await createdMember.reload()

    expect(createdMember.address).to.eq(rawMember.address)
  })

  describe('findMemberByAddress', () => {
    it('should find member by address only', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const member = await Models.Member.findMemberByAddress(createdMember.address)

      expect(member?.address).to.eq(createdMember.address)
    })

    it('should return all the details of the member if passed extra params', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const member = await Models.Member.findMemberByAddress(createdMember.address, {
        daoAddress: rawDaoMapping.daoAddress,
        network: rawDaoMapping.network,
        pluginAddress: rawPlugin.address,
        tokenAddress: rawPlugin.tokenAddress,
      })

      expect(member?.address).to.eq(createdMember.address)
      expect(member.tokenBalance).to.be.eq(rawMemberBalance.amount)
      expect(member.votingPower).to.be.eq(rawMemberBalance.votingPower)
      expect(member.metrics).to.be.exist
      expect(member.metrics?.delegateReceivedCount).to.be.eq(rawMemberMetrics.delegateReceivedCount)
    })
  })

  describe('findPaginatedMembersOnly', () => {
    beforeEach(async () => {
      await Models.Member.create(rawMember)
    })

    it('should find and paginate members only with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const aggregateSpy = sandbox.spy(Models.Member, 'aggregate')

      const response = await Models.Member.findPaginatedMembersOnly({
        paginationParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(rawMember.ens)
      expect(response.data[0]).to.have.property('avatar')
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should apply search filter correctly', async () => {
      const searchableMember = {
        id: 'searchable-member',
        address: '0xSearchableAddress',
        ens: 'searchableuser.eth',
        avatar: 'avatar.png',
      }

      await Models.Member.create(searchableMember)

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const response = await Models.Member.findPaginatedMembersOnly({
        paginationParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(searchableMember.address)
      expect(response.data[0].ens).to.eq(searchableMember.ens)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should return empty response when page exceeds total pages', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 999,
        order: 'asc',
        sort: 'createdAt',
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.Member.findPaginatedMembersOnly({
        paginationParams,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should correctly sort results by specified field', async () => {
      const member1 = {
        id: 'member-early',
        address: '0xAddressEarly',
        ens: 'earlyuser.eth',
        avatar: 'avatar.png',
        createdAt: new Date('2023-01-01'),
      }

      const member2 = {
        id: 'member-late',
        address: '0xAddressLate',
        ens: 'lateuser.eth',
        avatar: 'avatar.png',
        createdAt: new Date('2023-02-01'),
      }

      await Models.Member.create(member1)
      await Models.Member.create(member2)

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const response = await Models.Member.findPaginatedMembersOnly({
        paginationParams,
      })

      expect(response).to.have.property('data').with.lengthOf(3)
      expect(response.data[0].address).to.eq(member1.address)
      expect(response.data[1].address).to.eq(member2.address)
      expect(response.data[2].address).to.eq(rawMember.address)
      expect(response.metadata.totalRecords).to.eq(3)

      const descendingParams = {
        ...paginationParams,
        order: 'desc',
      }

      const descendingResponse = await Models.Member.findPaginatedMembersOnly({
        paginationParams: descendingParams,
      })

      expect(descendingResponse.data[0].address).to.eq(rawMember.address)
      expect(descendingResponse.data[2].address).to.eq(member1.address)
    })

    it('should return correct pageSize in response', async () => {
      const members: any = []

      for (let i = 0; i < 15; i++) {
        const member = {
          id: `member-${i}`,
          address: `0xAddress${i}`,
          ens: `member${i}.eth`,
          avatar: 'avatar.png',
        }

        members.push(member)
      }

      for (const member of members) {
        await Models.Member.create(member)
      }

      const paginationParams = {
        search: '',
        pageSize: 5,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const response = await Models.Member.findPaginatedMembersOnly({
        paginationParams,
      })

      expect(response).to.have.property('data').with.lengthOf(5)
      expect(response.metadata.pageSize).to.eq(5)
      expect(response.metadata.totalRecords).to.eq(16) // 15 new + 1 from beforeEach
      expect(response.metadata.totalPages).to.eq(4) // ceil(16/5) = 4

      const page2Response = await Models.Member.findPaginatedMembersOnly({
        paginationParams: { ...paginationParams, page: 2 },
      })

      expect(page2Response).to.have.property('data').with.lengthOf(5)
      expect(page2Response.metadata.page).to.eq(2)
    })

    it('should search by address or ENS', async () => {
      const memberWithUppercase = {
        id: 'member-upper',
        address: 'addressupper',
        ens: 'addressupper.eth',
        avatar: 'avatar.png',
      }

      await Models.Member.create(memberWithUppercase)

      // Search by lowercase address
      const addressSearchParams = {
        search: 'addressupper',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const addressResponse = await Models.Member.findPaginatedMembersOnly({
        paginationParams: addressSearchParams,
      })

      expect(addressResponse).to.have.property('data').with.lengthOf(1)
      expect(addressResponse.data[0].address).to.eq(memberWithUppercase.address)

      // Search by lowercase ENS
      const ensSearchParams = {
        search: 'addressupper',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const ensResponse = await Models.Member.findPaginatedMembersOnly({
        paginationParams: ensSearchParams,
      })

      expect(ensResponse).to.have.property('data').with.lengthOf(1)
      expect(ensResponse.data[0].ens).to.eq(memberWithUppercase.ens)
    })
  })
})
