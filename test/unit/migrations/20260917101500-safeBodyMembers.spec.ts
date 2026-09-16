import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import safeBodyMembersMigration from '@src/migrations/20260917101500-safeBodyMembers'
import { IPluginInterfaceType, IPluginMemberSource, IPluginStatus, ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const DAO = '0x665928FeacC8739116A3f2eF66a9c61936348DC2'
const SPP = '0x000000000000000000000000000000000000a001'

describe('migration: safe body members', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER])
    await Models.Setting.collection.dropIndexes().catch(() => undefined)

    await Models.Plugin.create({
      address: SPP,
      daoAddress: DAO,
      network: NETWORK,
      transactionHash: `0x${SPP.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await Models.Setting.create({
      transactionHash: `0x${SPP.slice(2).padEnd(64, '1')}`,
      blockNumber: 1,
      network: NETWORK,
      status: ISettingStatus.active,
      daoAddress: DAO,
      pluginAddress: SPP,
      stages: [{ stageIndex: 0, plugins: [{ address: SAFE }] }],
    })
  })

  afterEach(() => sandbox?.restore())

  it('indexes the owners of Safe bodies configured before the indexer existed', async () => {
    await safeBodyMembersMigration.start()

    const rows = await Models.PluginMember.find({ daoAddress: DAO, source: IPluginMemberSource.safe })
    expect(rows.map(row => row.memberAddress)).to.deep.equal([OWNER])
    expect(rows[0].pluginAddress).to.equal(SAFE)
  })

  it('builds the body-address index the owner events look the DAO up with', async () => {
    await safeBodyMembersMigration.start()

    const keys = (await Models.Setting.collection.indexes()).map((index: { key: object }) => JSON.stringify(index.key))
    expect(keys).to.include(JSON.stringify({ network: 1, status: 1, 'stages.plugins.address': 1 }))
  })

  it('can be run again without duplicating memberships', async () => {
    await safeBodyMembersMigration.start()
    await safeBodyMembersMigration.start()

    expect(await Models.PluginMember.countDocuments({ source: IPluginMemberSource.safe })).to.equal(1)
  })

  it('fails rather than retiring itself when the owners could not be read', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).rejects(new Error('rpc down'))

    await expect(safeBodyMembersMigration.start()).to.be.rejected
    expect(await Models.PluginMember.countDocuments({ source: IPluginMemberSource.safe })).to.equal(0)
  })

  describe('stop', () => {
    it('resolves', async () => {
      await expect(safeBodyMembersMigration.stop()).to.eventually.be.undefined
    })
  })
})
