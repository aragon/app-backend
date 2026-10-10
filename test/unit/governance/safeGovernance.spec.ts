import { Models } from '@dbModels'
import { SafeOwnerHandler } from '@handlers/safeOwnerHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance, MemberGovernanceFactory, SafeGovernance } from '@src/governance'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A' as HexAddress
const UNSEEN_SAFE = getAddress('0x000000000000000000000000000000000000dead') as HexAddress
const NETWORK = NetworksEnum.ethereumSepolia
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1' as HexAddress
const SECOND_OWNER = '0x251DB905400412a538072563212b4Ae7e23F96B8' as HexAddress
const THIRD_OWNER = getAddress('0x351db905400412a538072563212b4ae7e23f96b8') as HexAddress
const DAO_A = '0x665928FeacC8739116A3f2eF66a9c61936348DC2' as HexAddress
const DAO_B = '0x00000000000000000000000000000000000000B0' as HexAddress
const SPP_A = '0x000000000000000000000000000000000000a001' as HexAddress
const SPP_B = '0x000000000000000000000000000000000000B001' as HexAddress

const seedDao = async (daoAddress: HexAddress, sppAddress: HexAddress, bodies: HexAddress[]) => {
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
    stages: [{ stageIndex: 0, plugins: bodies.map(address => ({ address, brandId: VotingBodyBrandIdentity.SAFE })) }],
  })
}

const ownerEvent = (owner: HexAddress) => ({ args: { owner } }) as never
const logInfo = { network: NETWORK, address: SAFE, blockNumber: 1, transactionHash: '0x1' }

describe('Governance: Safe', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER, SECOND_OWNER])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves(null)
    await seedDao(DAO_A, SPP_A, [SAFE, SAFE])
    await seedDao(DAO_B, SPP_B, [SAFE])
  })

  afterEach(() => sandbox?.restore())

  it('creates Safe governance through the member factory', () => {
    const governance = MemberGovernanceFactory.create({
      address: SAFE,
      network: NETWORK,
      interfaceType: IPluginInterfaceType.safe,
    })
    expect(governance).to.be.instanceOf(SafeGovernance)
  })

  it('lists Safe owners with their member info and keeps the network separate', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await Models.Member.create({ address: OWNER, ens: 'alice.eth' })
    await Models.Member.create({ address: SECOND_OWNER, ens: 'bob.eth' })
    await Models.Member.create({ address: THIRD_OWNER, ens: 'carol.eth' })
    await Models.SafeMember.create({
      network: NetworksEnum.ethereumMainnet,
      safeAddress: SAFE,
      memberAddress: THIRD_OWNER,
    })

    const governance = new SafeGovernance(SAFE, NETWORK)
    const paginationParams = { search: '', pageSize: 1, page: 1, sort: 'address', order: 'asc' } as const
    const page1 = await governance.findAndPaginateMembers({ paginationParams: { ...paginationParams } })
    const page2 = await governance.findAndPaginateMembers({ paginationParams: { ...paginationParams, page: 2 } })

    expect([page1.data[0]?.address, page2.data[0]?.address].sort()).to.deep.equal([OWNER, SECOND_OWNER].sort())
    expect(page1.metadata.totalRecords).to.equal(2)

    const searched = await governance.findAndPaginateMembers({
      paginationParams: { ...paginationParams, search: 'alice', pageSize: 10 },
    })
    expect(searched.data.map(member => member.address)).to.deep.equal([OWNER])
    expect(searched.data[0]?.ens).to.equal('alice.eth')

    const networkIsolated = await governance.findAndPaginateMembers({
      paginationParams: { ...paginationParams, search: 'carol', pageSize: 10 },
    })
    expect(networkIsolated.data).to.deep.equal([])
    expect(networkIsolated.metadata.totalRecords).to.equal(0)
  })

  it('follows owners of an installed Safe process', async () => {
    const dao = '0x00000000000000000000000000000000000000c0' as HexAddress
    await Models.Plugin.create({
      address: UNSEEN_SAFE,
      daoAddress: dao,
      network: NETWORK,
      transactionHash: `0x${UNSEEN_SAFE.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await SafeBodyMembersModule.seedDao(dao, NETWORK)
    const metrics = RabbitMQHelper.sendMessage as sinon.SinonStub
    metrics.resetHistory()

    await SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), { ...logInfo, address: UNSEEN_SAFE } as never)

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: UNSEEN_SAFE })).to.equal(3)
    expect(metrics.calledOnce && metrics.firstCall.args[1].id === dao).to.be.true
  })

  it('ignores owner events for an unseen Safe', async () => {
    const info = { ...logInfo, address: UNSEEN_SAFE } as never
    await SafeOwnerHandler.addedOwner(ownerEvent(THIRD_OWNER), info)
    await SafeOwnerHandler.removedOwner(ownerEvent(THIRD_OWNER), info)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: UNSEEN_SAFE })).to.equal(0)
  })

  it('updates a known Safe when DAO discovery fails', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    sandbox.stub(SafeBodyMembersModule, 'findDaosWithSafeBody').rejects(new Error('database down'))
    const governance = new SafeGovernance(SAFE, NETWORK)

    expect(await governance.getOrCreate(THIRD_OWNER)).to.have.property('memberAddress', THIRD_OWNER)
    expect(await governance.delete(THIRD_OWNER)).to.equal(true)
    expect(await governance.findOne(THIRD_OWNER)).to.equal(null)
  })

  it('updates an unseen Safe when DAO discovery fails', async () => {
    sandbox.stub(SafeBodyMembersModule, 'findDaosWithSafeBody').rejects(new Error('database down'))
    const governance = new SafeGovernance(UNSEEN_SAFE, NETWORK)

    expect(await governance.getOrCreate(THIRD_OWNER)).to.have.property('memberAddress', THIRD_OWNER)
  })

  it('ignores an unparseable owner address', async () => {
    const governance = new SafeGovernance(SAFE, NETWORK)
    expect(await governance.getOrCreate('0xnot-an-address' as HexAddress)).to.equal(null)
    expect(await governance.delete('0xnot-an-address' as HexAddress)).to.equal(false)
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('ignores an unrelated Safe when the known owner check fails', async () => {
    sandbox.stub(SafeBodyMembersModule, 'findDaosWithSafeBody').resolves([])
    sandbox.stub(Models.SafeMember, 'exists').rejects(new Error('database down'))
    const governance = new SafeGovernance(UNSEEN_SAFE, NETWORK)

    expect(await governance.getOrCreate(THIRD_OWNER)).to.equal(null)
    expect(await governance.delete(THIRD_OWNER)).to.equal(false)
  })

  it('reports no removal for an owner the Safe never had', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    expect(await new SafeGovernance(SAFE, NETWORK).delete(THIRD_OWNER)).to.equal(false)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
  })

  it('preserves owners when Safe membership writes fail', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    sandbox.stub(Models.SafeMember, 'updateOne').rejects(new Error('write down'))
    const governance = new SafeGovernance(SAFE, NETWORK)

    expect(await governance.getOrCreate(THIRD_OWNER)).to.equal(null)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)

    sandbox.stub(Models.SafeMember, 'deleteOne').rejects(new Error('write down'))
    expect(await governance.delete(OWNER)).to.equal(false)
    expect(await governance.findOne(OWNER)).to.have.property('memberAddress', OWNER)
  })

  it('adds one owner and refreshes every referring DAO', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    const metrics = RabbitMQHelper.sendMessage as sinon.SinonStub
    metrics.resetHistory()

    const member = await new SafeGovernance(SAFE, NETWORK).getOrCreate(THIRD_OWNER)

    expect(member).to.have.property('memberAddress', THIRD_OWNER)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(3)
    expect(metrics.callCount).to.equal(2)
    expect(metrics.firstCall.args[1].id).to.equal(DAO_A)
    expect(metrics.secondCall.args[1].id).to.equal(DAO_B)
  })

  it('removes one owner and refreshes every referring DAO', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    const metrics = RabbitMQHelper.sendMessage as sinon.SinonStub
    metrics.resetHistory()

    expect(await new SafeGovernance(SAFE, NETWORK).delete(OWNER)).to.equal(true)
    expect(await Models.SafeMember.findOne({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })).to.equal(
      null,
    )
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(1)
    expect(metrics.callCount).to.equal(2)
  })

  it('keeps ownership current while every DAO relation is uninstalled', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await Models.Plugin.updateMany(
      { network: NETWORK, address: { $in: [SPP_A, SPP_B] } },
      { status: IPluginStatus.uninstalled },
    )

    expect(await new SafeGovernance(SAFE, NETWORK).getOrCreate(THIRD_OWNER)).to.have.property(
      'memberAddress',
      THIRD_OWNER,
    )

    await Models.Plugin.updateMany(
      { network: NETWORK, address: { $in: [SPP_A, SPP_B] } },
      { status: IPluginStatus.installed },
    )
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(3)
    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnce).to.be.true
  })
})
