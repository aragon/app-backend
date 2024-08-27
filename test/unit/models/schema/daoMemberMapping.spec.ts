import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'

describe('Model: TaskService', () => {
  let sandbox: SinonSandbox
  let rawDaoMemberMapping: Partial<DaoMemberMapping>[] = FakeDaoMemberMappings

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
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
})
