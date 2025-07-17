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
import { IPluginInterfaceType, NetworksEnum } from '@types'
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
      tokenAddress: null, // Multisig plugin has no token
    }
    rawMember = {
      ...(FakeMember as any),
    }
    rawDaoMemberMapping = [
      {
        ...(FakeDaoMemberMappings[0] as any),
        pluginAddress: rawPlugin.address, // Plugin without token → use pluginAddress
        tokenAddress: null, // No token for multisig
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
    expect(createdConfigIndexer.pluginAddress).to.eq(fakeDaoMemberMapping.pluginAddress)
    expect(createdConfigIndexer.tokenAddress).to.be.null // Should be null for plugin-based mapping
  })

  describe('findMapping', () => {
    it('Should findMapping with tokenAddress', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      // Create mapping with token (plugin has tokenAddress)
      const createdDaoMapping = await Models.DaoMemberMapping.create({
        ...fakeDaoMemberMapping,
        tokenAddress: '0xToken',
        pluginAddress: null, // Clear plugin when using token
      })

      const foundLogDao = await Models.DaoMemberMapping.findMapping({
        memberAddress: fakeDaoMemberMapping.memberAddress,
        tokenAddress: '0xToken',
        network: fakeDaoMemberMapping.network,
      } as any)

      expect(foundLogDao?.network).to.eq(createdDaoMapping.network)
      expect(foundLogDao?.tokenAddress).to.eq('0xToken')
      expect(foundLogDao?.pluginAddress).to.be.null
    })

    it('should find mapping with pluginAddress (no token)', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping
      const createdDaoMapping = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)

      const foundLogDao = await Models.DaoMemberMapping.findMapping({
        memberAddress: fakeDaoMemberMapping.memberAddress,
        pluginAddress: fakeDaoMemberMapping.pluginAddress,
        network: fakeDaoMemberMapping.network,
      } as any)

      expect(foundLogDao?.network).to.eq(createdDaoMapping.network)
      expect(foundLogDao?.pluginAddress).to.eq(fakeDaoMemberMapping.pluginAddress)
      expect(foundLogDao?.tokenAddress).to.be.null
    })
  })

  describe('Member Counting', () => {
    it('should count unique members by plugin address', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      // Create test data with same plugin but different members (plugin without token)
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        pluginAddress: '0xplugin1',
        tokenAddress: null,
      })

      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember2',
        pluginAddress: '0xplugin1',
        tokenAddress: null,
      })

      // Same member, different plugin - should not be counted
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        pluginAddress: '0xplugin2',
        tokenAddress: null,
      })

      const count = await Models.DaoMemberMapping.pluginCountUniqueMembers('0xplugin1', fakeDaoMemberMapping.network!)

      expect(count).to.eq(2)
    })

    it('should count unique members by token address', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      // Create test data with same token but different members (plugin with token)
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        tokenAddress: '0xtoken1',
        pluginAddress: null, // Clear plugin address when using token
      })

      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember2',
        tokenAddress: '0xtoken1',
        pluginAddress: null,
      })

      // Same member, different token - should not be counted
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        tokenAddress: '0xtoken2',
        pluginAddress: null,
      })

      const count = await Models.DaoMemberMapping.tokenCountUniqueMembers('0xtoken1', fakeDaoMemberMapping.network!)

      expect(count).to.eq(2)
    })

    it('should return 0 when no members found for plugin', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      const count = await Models.DaoMemberMapping.pluginCountUniqueMembers(
        '0xnonexistentplugin',
        fakeDaoMemberMapping.network!,
      )

      expect(count).to.eq(0)
    })

    it('should return 0 when no members found for token', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      const count = await Models.DaoMemberMapping.tokenCountUniqueMembers(
        '0xnonexistenttoken',
        fakeDaoMemberMapping.network!,
      )

      expect(count).to.eq(0)
    })

    it('should handle duplicate member entries correctly for plugin counting', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      // Create entry for plugin-based mapping
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        pluginAddress: '0xplugin1',
        tokenAddress: null,
      })

      const count = await Models.DaoMemberMapping.pluginCountUniqueMembers('0xplugin1', fakeDaoMemberMapping.network!)

      expect(count).to.eq(1)
    })

    it('should handle duplicate member entries correctly for token counting', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping

      // Create entry for token-based mapping
      await Models.DaoMemberMapping.create({
        network: fakeDaoMemberMapping.network,
        memberAddress: '0xmember1',
        tokenAddress: '0xtoken1',
        pluginAddress: null,
      })

      const count = await Models.DaoMemberMapping.tokenCountUniqueMembers('0xtoken1', fakeDaoMemberMapping.network!)

      expect(count).to.eq(1)
    })

    it('should filter by network correctly for plugin counting', async () => {
      // Use a unique plugin address to avoid conflicts with existing data
      const testPluginAddress = '0xUniquePluginForNetworkTest100'

      // Create members on different networks
      await Models.DaoMemberMapping.create({
        network: NetworksEnum.baseMainnet,
        memberAddress: '0xmember1',
        pluginAddress: testPluginAddress,
        tokenAddress: null,
      })

      await Models.DaoMemberMapping.create({
        network: NetworksEnum.polygonMainnet, // Different network
        memberAddress: '0xmember2',
        pluginAddress: testPluginAddress,
        tokenAddress: null,
      })

      const count = await Models.DaoMemberMapping.pluginCountUniqueMembers(testPluginAddress, NetworksEnum.baseMainnet)

      expect(count).to.eq(1) // Should only count members on the specified network
    })

    it('should filter by network correctly for token counting', async () => {
      // Create members on different networks
      await Models.DaoMemberMapping.create({
        network: NetworksEnum.baseMainnet,
        memberAddress: '0xmember1',
        tokenAddress: '0xtoken1',
        pluginAddress: null,
      })

      await Models.DaoMemberMapping.create({
        network: NetworksEnum.polygonMainnet, // Different network
        memberAddress: '0xmember2',
        tokenAddress: '0xtoken1',
        pluginAddress: null,
      })

      const count = await Models.DaoMemberMapping.tokenCountUniqueMembers('0xtoken1', NetworksEnum.baseMainnet)

      expect(count).to.eq(1) // Should only count members on the specified network
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
      pluginAddress: fakeDaoMemberMapping.pluginAddress,
      tokenAddress: fakeDaoMemberMapping.tokenAddress,
      network: fakeDaoMemberMapping.network,
    } as any)
    expect(foundLogDao).to.be.null
  })

  describe('pagination', () => {
    let rawDaoMemberMapping: Partial<DaoMemberMapping>
    beforeEach(async () => {
      rawDaoMemberMapping = {
        ...(FakeDaoMemberMappings[0] as any),
        daoAddress: rawDao.address,
        pluginAddress: rawPlugin.address,
        memberAddress: rawMember.address,
        tokenAddress: null, // Plugin without token
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
        id: crypto.randomUUID(),
        address: '0xAnotherAddress',
        ens: 'searchableterm.eth',
        avatar: 'avatar',
      }

      await Models.Member.create(memberWithSearchableName)

      const memberMappingWithSearchable = {
        network: rawDaoMemberMapping.network,
        memberAddress: memberWithSearchableName.address,
        pluginAddress: '0xSearchablePlugin',
        tokenAddress: null,
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
        id: crypto.randomUUID(),
        address: '0xAddress1',
        ens: 'first.eth',
        avatar: 'avatar1',
      }

      const member2 = {
        id: crypto.randomUUID(),
        address: '0xAddress2',
        ens: 'second.eth',
        avatar: 'avatar2',
      }

      const mapping1 = {
        network: rawDaoMemberMapping.network,
        memberAddress: member1.address,
        pluginAddress: '0xPlugin1',
        tokenAddress: null,
      }

      const mapping2 = {
        network: rawDaoMemberMapping.network,
        memberAddress: member2.address,
        pluginAddress: '0xPlugin2',
        tokenAddress: null,
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
      expect(response.metadata.totalRecords).to.eq(3)

      const descendingParams = {
        ...paginationParams,
        order: 'desc',
      }

      const descendingResponse = await Models.DaoMemberMapping.findAndPaginate({
        paginationParams: descendingParams,
        extraParams,
      })

      expect(descendingResponse.data).to.have.lengthOf(3)
    })

    it('should return correct pageSize in response', async () => {
      const members: any = []
      const mappings: any = []

      for (let i = 0; i < 15; i++) {
        const member = {
          id: crypto.randomUUID(),
          address: `0xAddress${i}`,
          ens: `member${i}.eth`,
          avatar: 'avatar',
        }

        const mapping = {
          network: rawDaoMemberMapping.network,
          memberAddress: member.address,
          pluginAddress: `0xPlugin${i}`,
          tokenAddress: null,
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
