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

  it('Should findMapping', async () => {
    const [fakeDaoMemberMapping] = rawDaoMemberMapping
    const createdDaoMapping = await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
    const foundLogDao = await Models.DaoMemberMapping.findMapping({
      memberAddress: fakeDaoMemberMapping.memberAddress,
      daoAddress: fakeDaoMemberMapping.daoAddress,
      pluginAddress: fakeDaoMemberMapping.pluginAddress,
      tokenAddress: fakeDaoMemberMapping.tokenAddress,
      network: fakeDaoMemberMapping.network,
    } as any)
    expect(foundLogDao?.network).to.eq(createdDaoMapping.network)
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

  describe('findDaosByMemberWithPagination', () => {
    it('should find daos by member with pagination', async () => {
      const [fakeDaoMemberMapping] = rawDaoMemberMapping
      await Models.DaoMemberMapping.create(fakeDaoMemberMapping)
      const foundLogDao = await Models.DaoMemberMapping.findDaosByMemberWithPagination({
        extraParams: {
          memberAddress: fakeDaoMemberMapping.memberAddress,
          network: fakeDaoMemberMapping.network,
        },
        paginationParams: {},
      })
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = foundLogDao

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(pageSize).to.eq(10)
      expect(totalPages).to.eq(1)

      expect(data[0].network).to.eq(fakeDaoMemberMapping.network)
      expect(data[0].address).to.be.eq(fakeDaoMemberMapping.daoAddress)
    })

    it('should return empty array if no daos found', async () => {
      const foundLogDao = await Models.DaoMemberMapping.findDaosByMemberWithPagination({
        extraParams: {
          memberAddress: '0x00',
          network: '1',
        },
        paginationParams: {},
      } as any)
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = foundLogDao

      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(pageSize).to.eq(10)
      expect(totalPages).to.eq(1)
    })
  })
})
