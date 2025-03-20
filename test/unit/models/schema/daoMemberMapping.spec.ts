import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { DaoList } from '@test/mock/fakeDao'
import { FakeMember } from '@test/mock/fakeMember'
import { PluginList } from '@test/mock/fakePlugins'
import Dao from '@models/schema/dao'
import Plugin from '@models/schema/plugin'
import Member from '@models/schema/member'
import { IPluginInterfaceType } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: DaoMemberMappings', () => {
  let sandbox: SinonSandbox
  let rawDaoMemberMapping: Partial<DaoMemberMapping>[]
  let rawDao: Partial<Dao>
  let rawPlugin: Partial<Plugin>
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawDao = {
      ...(DaoList[0] as any),
      address: FakeDaoMemberMappings[0].daoAddress,
    }
    rawPlugin = {
      ...(PluginList[0] as any),
      address: FakeDaoMemberMappings[0].pluginAddress,
      daoAddress: FakeDaoMemberMappings[0].daoAddress,
      interfaceType: IPluginInterfaceType.multisig,
    }
    rawMember = {
      ...(FakeMember as any),
    }
    rawDaoMemberMapping = [
      {
        ...(FakeDaoMemberMappings[0] as any),
        daoAddress: rawDao.address,
        pluginAddress: rawPlugin.address,
        memberAddress: rawMember.address,
      },
    ]

    await Models.Dao.create(rawDao)
    await Models.Plugin.create(rawPlugin)
    await Models.Member.create(rawMember)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create daoMemberMapping', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdConfigIndexer = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)

    expect(createdConfigIndexer.network).to.eq(fakeDaoMemberMapping.network)
    expect(createdConfigIndexer.memberAddress).to.eq(fakeDaoMemberMapping.memberAddress)
    expect(createdConfigIndexer.daoAddress).to.eq(fakeDaoMemberMapping.daoAddress)
    expect(createdConfigIndexer.pluginAddress).to.eq(fakeDaoMemberMapping.pluginAddress)
  })

  describe('findMapping', () => {
    it('Should findMapping', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping
      const createdDaoMapping = await Models.DaoMemberMapping.create({
        ...fakeDaoMemberMapping,
        tokenAddress: '0xToken',
      })
      const foundLogDao = await Models.DaoMemberMapping.findMapping({
        memberAddress: fakeDaoMemberMapping.memberAddress,
        daoAddress: fakeDaoMemberMapping.daoAddress,
        pluginAddress: fakeDaoMemberMapping.pluginAddress,
        tokenAddress: '0xToken',
        network: fakeDaoMemberMapping.network,
      } as any)
      expect(foundLogDao?.network).to.eq(createdDaoMapping.network)
    })

    it('should find mapping if no token address is passed', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping
      const createdDaoMapping = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
      const foundLogDao = await Models.DaoMemberMapping.findMapping({
        memberAddress: fakeDaoMemberMapping.memberAddress,
        daoAddress: fakeDaoMemberMapping.daoAddress,
        pluginAddress: fakeDaoMemberMapping.pluginAddress,
        network: fakeDaoMemberMapping.network,
      } as any)
      expect(foundLogDao?.network).to.eq(createdDaoMapping.network)
    })
  })

  it('Should findAllMembersOfPlugin', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdDaoMapping = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
    const foundLogDao = await Models.DaoMemberMapping.findAllMembersOfPlugin({
      pluginAddress: fakeDaoMemberMapping.pluginAddress,
      network: fakeDaoMemberMapping.network,
    } as any)
    expect(foundLogDao[0].network).to.eq(createdDaoMapping.network)
  })

  it('Should update daoMember', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdConfigIndexer = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)

    const updated = await createdConfigIndexer.update({
      tokenAddress: '0x00',
    })

    expect(updated.tokenAddress).to.eq('0x00')
  })

  it('Should reload', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdConfigIndexer = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
    const reloaded = await createdConfigIndexer.reload()

    expect(reloaded.network).to.eq(reloaded.network)
  })

  it('should removeSelf', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdConfigIndexer = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
    await createdConfigIndexer.removeSelf()
    const foundLogDao = await Models.DaoMemberMapping.findMapping({
      memberAddress: fakeDaoMemberMapping.memberAddress,
      daoAddress: fakeDaoMemberMapping.daoAddress,
      pluginAddress: fakeDaoMemberMapping.pluginAddress,
      tokenAddress: fakeDaoMemberMapping.tokenAddress,
      network: fakeDaoMemberMapping.network,
    } as any)
    expect(foundLogDao).to.be.null
  })

  it('should countUniqueMembers', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
    const count = await Models.DaoMemberMapping.countUniqueMembers(
      fakeDaoMemberMapping.daoAddress!,
      fakeDaoMemberMapping.network!,
    )
    expect(count).to.eq(1)
  })

  it('should count properly unique member', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping

    await Models.DaoMemberMapping.create({
      ...fakeDaoMemberMapping,
      daoAddress: '0xdao',
      memberAddress: '0xmember',
      pluginAddress: '0xplugin',
    })

    await Models.DaoMemberMapping.create({
      ...fakeDaoMemberMapping,
      daoAddress: '0xdao',
      memberAddress: '0xmember',
      pluginAddress: '0xplugin2',
    })

    await Models.DaoMemberMapping.create({
      ...fakeDaoMemberMapping,
      daoAddress: '0xdao',
      memberAddress: '0xmember2',
      pluginAddress: '0xplugin3',
    })

    const count = await Models.DaoMemberMapping.countUniqueMembers('0xdao', fakeDaoMemberMapping.network!)
    expect(count).to.eq(2)
  })

  describe('pagination', () => {
    let rawDaoMemberMapping: Partial<DaoMemberMapping>
    beforeEach(async () => {
      rawDaoMemberMapping = {
        ...(FakeDaoMemberMappings[0] as any),
        daoAddress: rawDao.address,
        pluginAddress: rawPlugin.address,
        memberAddress: rawMember.address,
      }

      await Models.DaoMemberMapping.create(rawDaoMemberMapping)
    })

    it('should find and paginate members with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawDaoMemberMapping.pluginAddress,
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
      }

      const aggregateSpy = sandbox.spy(Models.DaoMemberMapping, 'aggregate')

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0]).to.have.property('ens')
      expect(response.data[0]).to.have.property('metrics')
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should find and paginate members with pluginAddress only', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should find and paginate members with daoAddress only', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should find and paginate members with network only', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        network: rawDaoMemberMapping.network,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should apply search filter when search parameter is provided', async () => {
      const memberWithSearchableName = {
        id: crypto.randomUUID(), // Use a random UUID to avoid duplicate key errors
        address: '0xAnotherAddress',
        ens: 'searchableterm.eth',
        avatar: 'avatar',
      }

      await Models.Member.create(memberWithSearchableName)

      const memberMappingWithSearchable = {
        ...rawDaoMemberMapping,
        id: crypto.randomUUID(), // Use a random UUID here too
        memberAddress: memberWithSearchableName.address,
      }

      await Models.DaoMemberMapping.create(memberMappingWithSearchable)

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(memberWithSearchableName.address)
      expect(response.data[0].ens).to.eq(memberWithSearchableName.ens)
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

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should correctly sort results by specified field', async () => {
      const member1 = {
        ...rawMember,
        id: crypto.randomUUID(), // Random UUID to avoid duplicate key
        address: '0xAddress1',
        ens: 'first.eth',
        createdAt: new Date('2023-01-01'),
      }

      const member2 = {
        ...rawMember,
        id: crypto.randomUUID(), // Random UUID to avoid duplicate key
        address: '0xAddress2',
        ens: 'second.eth',
        createdAt: new Date('2023-02-01'),
      }

      const mapping1 = {
        ...rawDaoMemberMapping,
        id: crypto.randomUUID(), // Random UUID to avoid duplicate key
        memberAddress: member1.address,
        createdAt: new Date('2023-01-01'),
      }

      const mapping2 = {
        ...rawDaoMemberMapping,
        id: crypto.randomUUID(), // Random UUID to avoid duplicate key
        memberAddress: member2.address,
        createdAt: new Date('2023-02-01'),
      }

      await Models.Member.create(member1)
      await Models.Member.create(member2)
      await Models.DaoMemberMapping.create(mapping1)
      await Models.DaoMemberMapping.create(mapping2)

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(3)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[1].address).to.eq(member1.address)
      expect(response.data[2].address).to.eq(member2.address)
      expect(response.metadata.totalRecords).to.eq(3)

      const descendingParams = {
        ...paginationParams,
        order: 'desc',
      }

      const descendingResponse = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams: descendingParams,
        extraParams,
      })

      expect(descendingResponse.data[0].address).to.eq(rawMember.address)
      expect(descendingResponse.data[2].address).to.eq(member2.address)
    })

    it('should return correct pageSize in response', async () => {
      const members: any = []
      const mappings: any = []

      for (let i = 0; i < 15; i++) {
        const member = {
          ...rawMember,
          id: crypto.randomUUID(), // Random UUID to avoid duplicate key
          address: `0xAddress${i}`,
          ens: `member${i}.eth`,
        }

        const mapping = {
          ...rawDaoMemberMapping,
          id: crypto.randomUUID(), // Random UUID to avoid duplicate key
          memberAddress: member.address,
        }

        members.push(member)
        mappings.push(mapping)
      }

      for (const member of members) {
        await Models.Member.create(member)
      }

      for (const mapping of mappings) {
        await Models.DaoMemberMapping.create(mapping)
      }

      const paginationParams = {
        search: '',
        pageSize: 5,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
      }

      const response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(5)
      expect(response.metadata.pageSize).to.eq(5)
      expect(response.metadata.totalRecords).to.eq(16) // 15 new + 1 from beforeEach
      expect(response.metadata.totalPages).to.eq(4) // ceil(16/5) = 4

      const page2Response = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams: { ...paginationParams, page: 2 },
        extraParams,
      })

      expect(page2Response).to.have.property('data').with.lengthOf(5)
      expect(page2Response.metadata.page).to.eq(2)
    })
  })
})
