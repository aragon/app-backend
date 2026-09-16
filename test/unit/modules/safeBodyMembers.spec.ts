import DaoController from '@api/controllers/dao'
import MemberController from '@api/controllers/member'
import { Models } from '@dbModels'
import { SafeOwnerHandler } from '@handlers/safeOwnerHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { IPluginInterfaceType, IPluginMemberSource, IPluginStatus, ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const SECOND_OWNER = '0x251DB905400412a538072563212b4Ae7e23F96B8'
const DAO_A = '0x665928FeacC8739116A3f2eF66a9c61936348DC2'
const DAO_B = '0x00000000000000000000000000000000000000B0'
const SPP_A = '0x000000000000000000000000000000000000a001'
const SPP_B = '0x000000000000000000000000000000000000B001'
const MULTISIG = '0x000000000000000000000000000000000000CcCc'

const seedDao = async (daoAddress: string, sppAddress: string, bodies: string[]) => {
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
    stages: [{ stageIndex: 0, plugins: bodies.map(address => ({ address })) }],
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

    // One Safe, body of two DAOs. DAO A also runs a multisig that lists OWNER.
    await seedDao(DAO_A, SPP_A, [SAFE])
    await seedDao(DAO_B, SPP_B, [SAFE])
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
    await Models.PluginMember.create({
      memberAddress: OWNER,
      pluginAddress: MULTISIG,
      daoAddress: DAO_A,
      network: NETWORK,
    })
  })

  afterEach(() => sandbox?.restore())

  it('indexes the owners of a Safe body as members of the DAO', async () => {
    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)

    const members = await MemberController.getMembersWithPagination(
      {},
      { network: NETWORK, daoAddress: DAO_A, pluginAddress: SAFE },
    )

    expect(members.data.map(member => member.address).sort()).to.deep.equal([OWNER, SECOND_OWNER].sort())
    expect(await MemberController.isMemberOfPlugin(SECOND_OWNER, SAFE, NETWORK)).to.be.true
    expect(await DaoController.getDaosOfMemberInNetwork(SECOND_OWNER)).to.deep.equal([DAO_A])
  })

  it('still 404s for an address that is neither a plugin nor a Safe body', async () => {
    await expect(
      MemberController.getMembersWithPagination(
        {},
        { network: NETWORK, daoAddress: DAO_A, pluginAddress: '0x0000000000000000000000000000000000000dEaD' },
      ),
    ).to.be.rejected
  })

  it('leaves an internal plugin body alone, without a chain probe', async () => {
    await Models.Setting.updateOne(
      { pluginAddress: SPP_A, network: NETWORK },
      { stages: [{ stageIndex: 0, plugins: [{ address: SAFE }, { address: MULTISIG }] }] },
    )

    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)

    const probed = (SafeChainReaderModule.readOwners as sinon.SinonStub).getCalls().map(call => call.args[1])
    expect(probed).to.deep.equal([SAFE])
    expect(await Models.PluginMember.countDocuments({ pluginAddress: MULTISIG })).to.equal(1)
  })

  it('counts owners as wallets, not the Safe as one member', async () => {
    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)

    // Two owners, one of whom is also the multisig member: two distinct wallets.
    expect(await Models.Dao.countUniqueMembers(DAO_A, NETWORK)).to.equal(2)
  })

  it('fans an added owner out to every DAO holding the Safe as a body', async () => {
    await SafeOwnerHandler.addedOwner(ownerEvent(SECOND_OWNER), logInfo)

    expect((await DaoController.getDaosOfMemberInNetwork(SECOND_OWNER)).sort()).to.deep.equal([DAO_A, DAO_B].sort())
  })

  it('withdraws a removed owner from every DAO, leaving other routes intact', async () => {
    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)
    await SafeBodyMembersModule.syncDao(DAO_B, NETWORK)

    await SafeOwnerHandler.removedOwner(ownerEvent(OWNER), logInfo)

    // OWNER keeps DAO A through the multisig; SECOND_OWNER still has both DAOs through the Safe.
    expect(await DaoController.getDaosOfMemberInNetwork(OWNER)).to.deep.equal([DAO_A])
    expect(await Models.PluginMember.countDocuments({ memberAddress: OWNER })).to.equal(1)
    expect((await DaoController.getDaosOfMemberInNetwork(SECOND_OWNER)).sort()).to.deep.equal([DAO_A, DAO_B].sort())
  })

  it('withdraws what an uninstalled plugin conferred and nothing else', async () => {
    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)
    await SafeBodyMembersModule.syncDao(DAO_B, NETWORK)

    await Models.Plugin.updateOne({ address: SPP_B, network: NETWORK }, { status: IPluginStatus.uninstalled })
    await SafeBodyMembersModule.syncDao(DAO_B, NETWORK)

    expect(await DaoController.getDaosOfMemberInNetwork(SECOND_OWNER)).to.deep.equal([DAO_A])
    expect(await Models.PluginMember.countDocuments({ daoAddress: DAO_B, source: IPluginMemberSource.safe })).to.equal(
      0,
    )
  })

  it('leaves memberships untouched when the owner set cannot be read', async () => {
    await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).rejects(new Error('rpc down'))

    expect(await SafeBodyMembersModule.syncDao(DAO_A, NETWORK)).to.equal(null)
    expect(await Models.PluginMember.countDocuments({ daoAddress: DAO_A, source: IPluginMemberSource.safe })).to.equal(
      2,
    )
  })
})
