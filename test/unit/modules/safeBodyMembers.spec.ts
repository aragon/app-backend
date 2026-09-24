import { Models } from '@dbModels'
import { SafeOwnerHandler } from '@handlers/safeOwnerHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ProviderModule from '@modules/provider'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeRelationsModule from '@modules/safe/safeRelations'
import MemberController from '@services/aragon-api/controllers/member'
import { BaseGovernance } from '@src/governance'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const CROSS_BODY_SAFE = getAddress('0x000000000000000000000000000000000000beef')
const UNSEEN_SAFE = getAddress('0x000000000000000000000000000000000000dead')

const NETWORK = NetworksEnum.ethereumSepolia
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const SECOND_OWNER = '0x251DB905400412a538072563212b4Ae7e23F96B8'
const THIRD_OWNER = getAddress('0x351db905400412a538072563212b4ae7e23f96b8')
const DAO_A = '0x665928FeacC8739116A3f2eF66a9c61936348DC2'
const DAO_B = '0x00000000000000000000000000000000000000B0'
const SPP_A = '0x000000000000000000000000000000000000a001'
const SPP_B = '0x000000000000000000000000000000000000B001'
const MULTISIG = '0x000000000000000000000000000000000000CcCc'

const seedDao = async (
  daoAddress: string,
  sppAddress: string,
  bodies: Array<{ address: string; brandId?: VotingBodyBrandIdentity }>,
) => {
  await Models.Dao.create({
    address: daoAddress,
    network: NETWORK,
    creatorAddress: OWNER,
    transactionHash: `0x${daoAddress.slice(2).padEnd(64, '0')}`,
    blockNumber: 1,
    isActive: true,
  })
  await Models.Plugin.create({
    address: sppAddress,
    daoAddress,
    network: NETWORK,
    transactionHash: `0x${sppAddress.slice(2).padEnd(64, '0')}`,
    blockNumber: 1,
    interfaceType: IPluginInterfaceType.spp,
    status: IPluginStatus.installed,
    isSupported: true,
  })
  await Models.Setting.create({
    transactionHash: `0x${sppAddress.slice(2).padEnd(64, '1')}`,
    blockNumber: 1,
    network: NETWORK,
    status: ISettingStatus.active,
    daoAddress,
    pluginAddress: sppAddress,
    stages: [
      {
        stageIndex: 0,
        plugins: bodies.map(({ address, brandId = VotingBodyBrandIdentity.SAFE }) => ({ address, brandId })),
      },
    ],
  })
}

const ownerEvent = (owner: string) => ({ args: { owner } }) as never
const logInfo = { network: NETWORK, address: SAFE, blockNumber: 1, transactionHash: '0x1' } as never

describe('Module: SafeBodyMembers', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER, SECOND_OWNER])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getBlockNumber: async () => 100 } as never)

    await seedDao(DAO_A, SPP_A, [{ address: SAFE }, { address: SAFE }])
    await seedDao(DAO_B, SPP_B, [{ address: SAFE }])
    await Models.Plugin.create({
      address: MULTISIG,
      daoAddress: DAO_A,
      network: NETWORK,
      transactionHash: `0x${MULTISIG.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.multisig,
      status: IPluginStatus.installed,
      isSupported: true,
    })
  })

  afterEach(() => sandbox?.restore())

  it('seeds one global owner set for a Safe shared by two DAOs, pinned to a block', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await SafeBodyMembersModule.seedDao(DAO_B, NETWORK)

    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).alwaysCalledWith(NETWORK, SAFE, 100)).to.be.true
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(await Models.SafeMember.distinct('id', { safeAddress: SAFE })).to.have.length(2)
    expect((await Models.SafeOwnerSync.findOne({ network: NETWORK, safeAddress: SAFE }))?.blockNumber).to.equal(100)
  })

  it('repairs a partial seed into the full owner set and drops an owner the chain no longer has', async () => {
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: THIRD_OWNER })

    const outcome = await SafeBodyMembersModule.syncOwners(NETWORK, SAFE)

    expect(outcome).to.deep.equal({ blockNumber: 100, added: 1, removed: 1 })
    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      OWNER,
      SECOND_OWNER,
    ])
  })

  it('refuses a snapshot older than the checkpoint and an empty one', async () => {
    await Models.SafeOwnerSync.create({
      id: `${NETWORK}-${SAFE}`,
      network: NETWORK,
      safeAddress: SAFE,
      blockNumber: 500,
    })

    expect(await SafeBodyMembersModule.syncOwners(NETWORK, SAFE)).to.equal(null)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(0)
    expect((await Models.SafeOwnerSync.findOne({ network: NETWORK, safeAddress: SAFE }))?.blockNumber).to.equal(500)

    await Models.SafeOwnerSync.deleteMany({})
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([])

    expect(await SafeBodyMembersModule.syncOwners(NETWORK, SAFE)).to.equal(null)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(0)
  })

  it('paginates searched Safe owners with network isolation through the member controller', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await Models.Member.create({ address: OWNER, ens: 'alice.eth' })
    await Models.Member.create({ address: SECOND_OWNER, ens: 'bob.eth' })
    await Models.Member.create({ address: THIRD_OWNER, ens: 'carol.eth' })
    await Models.SafeMember.create({
      network: NetworksEnum.ethereumMainnet,
      safeAddress: SAFE,
      memberAddress: THIRD_OWNER,
    })

    const extraParams = { daoAddress: DAO_A, pluginAddress: SAFE, network: NETWORK }
    const page1 = await MemberController.getMembersWithPagination(
      { search: '', pageSize: 1, page: 1, sort: 'address', order: 'asc' },
      extraParams,
    )
    const page2 = await MemberController.getMembersWithPagination(
      { search: '', pageSize: 1, page: 2, sort: 'address', order: 'asc' },
      extraParams,
    )

    expect([page1.data[0]?.address, page2.data[0]?.address].sort()).to.deep.equal([OWNER, SECOND_OWNER].sort())
    expect(page1.metadata.totalRecords).to.equal(2)

    const searched = await MemberController.getMembersWithPagination(
      { search: 'alice', pageSize: 10, page: 1, sort: 'address', order: 'asc' },
      extraParams,
    )
    expect(searched.data.map(member => member.address)).to.deep.equal([OWNER])

    const networkIsolated = await MemberController.getMembersWithPagination(
      { search: 'carol', pageSize: 10, page: 1, sort: 'address', order: 'asc' },
      extraParams,
    )
    expect(networkIsolated.data).to.deep.equal([])
    expect(networkIsolated.metadata.totalRecords).to.equal(0)
  })

  it('seeds only SAFE-branded bodies and requires an installed SPP parent', async () => {
    await Models.Setting.updateOne(
      { pluginAddress: SPP_A, network: NETWORK },
      { stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.OTHER }] }] },
    )
    await Models.Plugin.updateOne(
      { address: SPP_B, network: NETWORK },
      { interfaceType: IPluginInterfaceType.multisig },
    )
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resetHistory()

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await SafeBodyMembersModule.seedDao(DAO_B, NETWORK)

    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('ignores owner events for an unseen Safe', async () => {
    const info = { network: NETWORK, address: UNSEEN_SAFE, blockNumber: 1, transactionHash: '0x1' } as never

    await SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), info)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: UNSEEN_SAFE })).to.equal(0)
    await SafeOwnerHandler.removedOwner(ownerEvent(THIRD_OWNER), info)

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: UNSEEN_SAFE })).to.equal(0)
  })

  it('does not throw when a Safe owner read fails', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).rejects(new Error('rpc down'))

    await expect(SafeBodyMembersModule.seedDao(DAO_A, NETWORK)).not.to.be.rejected
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('preserves seeded ownership when metrics publication fails', async () => {
    ;(RabbitMQHelper.sendMessage as sinon.SinonStub).rejects(new Error('broker down'))

    await expect(SafeBodyMembersModule.seedDao(DAO_A, NETWORK)).not.to.be.rejected
    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      OWNER,
      SECOND_OWNER,
    ])
  })

  it('reads no owners and writes nothing when DAO relation discovery fails', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    sandbox.stub(SafeRelationsModule, 'findDaos').rejects(new Error('database down'))
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resetHistory()

    await expect(SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), logInfo)).not.to.be.rejected

    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
  })

  it('does not throw when Safe discovery fails', async () => {
    sandbox.stub(SafeRelationsModule, 'getSafeAddresses').rejects(new Error('database down'))

    await expect(SafeBodyMembersModule.seedDao(DAO_A, NETWORK)).not.to.be.rejected
  })

  it('skips a body that is conclusively not a Safe', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves(null)

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('ignores an owner event whose Safe address does not parse', async () => {
    const info = { network: NETWORK, address: '0xnot-an-address', blockNumber: 1, transactionHash: '0x1' } as never

    await expect(SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), info)).not.to.be.rejected
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('writes nothing for an unrelated Safe when the known-ownership check fails', async () => {
    sandbox.stub(SafeRelationsModule, 'findDaos').resolves([])
    sandbox.stub(Models.SafeMember, 'exists').rejects(new Error('database down'))
    const info = { network: NETWORK, address: UNSEEN_SAFE, blockNumber: 1, transactionHash: '0x1' } as never

    await expect(SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), info)).not.to.be.rejected
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('keeps the stored owners when the snapshot write fails', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([OWNER, SECOND_OWNER, THIRD_OWNER])
    ;(ProviderModule.getAnyRpcProvider as sinon.SinonStub).returns({ getBlockNumber: async () => 101 } as never)
    sandbox.stub(Models.SafeMember, 'insertMany').rejects(new Error('write down'))

    await expect(SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), logInfo)).not.to.be.rejected
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
  })

  it('takes a full snapshot on an owner event and fans metrics out to every referring DAO', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    const metrics = RabbitMQHelper.sendMessage as sinon.SinonStub
    metrics.resetHistory()
    // the event only says something changed; the chain says who the owners are now
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([SECOND_OWNER, THIRD_OWNER])
    ;(ProviderModule.getAnyRpcProvider as sinon.SinonStub).returns({ getBlockNumber: async () => 101 } as never)

    await SafeOwnerHandler.removedOwner(ownerEvent(OWNER), logInfo)

    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      SECOND_OWNER,
      THIRD_OWNER,
    ])
    expect(metrics.callCount).to.equal(2)
    expect(metrics.firstCall.args[1].id).to.equal(DAO_A)
    expect(metrics.secondCall.args[1].id).to.equal(DAO_B)
  })

  it('keeps global ownership current while all DAO relations are uninstalled', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await Models.Plugin.updateMany(
      { network: NETWORK, address: { $in: [SPP_A, SPP_B] } },
      { status: IPluginStatus.uninstalled },
    )
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([OWNER, SECOND_OWNER, THIRD_OWNER])
    ;(ProviderModule.getAnyRpcProvider as sinon.SinonStub).returns({ getBlockNumber: async () => 101 } as never)

    await SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), logInfo)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(3)
  })
})
