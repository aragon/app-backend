import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
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

describe('Module: SafeBodyMembers', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER, SECOND_OWNER])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves({})

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

  it('seeds one global owner set for a Safe shared by two DAOs', async () => {
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)
    await SafeBodyMembersModule.seedDao(DAO_B, NETWORK)

    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnceWith(NETWORK, SAFE)).to.be.true
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(await Models.SafeMember.distinct('id', { safeAddress: SAFE })).to.have.length(2)
  })

  it('batches Safe relation discovery without crossing SAFE brand bodies', async () => {
    const dao = '0x000000000000000000000000000000000000c001'
    const spp = '0x000000000000000000000000000000000000c002'
    await seedDao(dao, spp, [
      { address: CROSS_BODY_SAFE, brandId: VotingBodyBrandIdentity.OTHER },
      { address: SAFE, brandId: VotingBodyBrandIdentity.SAFE },
    ])

    const daos = await SafeBodyMembersModule.findDaosWithSafeBody([SAFE, CROSS_BODY_SAFE], NETWORK)
    expect(daos.map(({ daoAddress }) => daoAddress)).to.have.members([DAO_A, DAO_B, dao])

    expect(await SafeBodyMembersModule.findDaosWithSafeBody([CROSS_BODY_SAFE], NETWORK)).to.deep.equal([])
  })

  it('lists the SPP plugins a Safe is a body of, not the ones it only shares a stage with', async () => {
    const dao = '0x000000000000000000000000000000000000c001'
    const spp = '0x000000000000000000000000000000000000c002'
    await seedDao(dao, spp, [{ address: CROSS_BODY_SAFE, brandId: VotingBodyBrandIdentity.OTHER }])

    const plugins = await SafeBodyMembersModule.bodyPluginsOf(SAFE, NETWORK)

    expect([...plugins]).to.have.members([SPP_A, SPP_B])
    expect(await SafeBodyMembersModule.bodyPluginsOf(CROSS_BODY_SAFE, NETWORK)).to.deep.equal(new Set())
  })

  describe('a Safe holding execute on a DAO', () => {
    const DAO_C = '0x00000000000000000000000000000000000000c0'
    const safeProcess = () =>
      Models.Plugin.create({
        address: UNSEEN_SAFE,
        daoAddress: DAO_C,
        network: NETWORK,
        transactionHash: `0x${UNSEEN_SAFE.slice(2).padEnd(64, '0')}`,
        blockNumber: 1,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isSupported: true,
      })

    it('is a Safe of that DAO while its process is installed', async () => {
      await safeProcess()

      expect(await SafeBodyMembersModule.getSafeAddresses(DAO_C, NETWORK)).to.deep.equal([UNSEEN_SAFE])
      expect(await SafeBodyMembersModule.findDaosWithSafeBody([UNSEEN_SAFE], NETWORK)).to.deep.equal([
        { daoAddress: DAO_C, network: NETWORK },
      ])

      await Models.Plugin.updateOne({ address: UNSEEN_SAFE }, { status: IPluginStatus.uninstalled })
      expect(await SafeBodyMembersModule.getSafeAddresses(DAO_C, NETWORK)).to.deep.equal([])
    })

    it('seeds the owners of an installed Safe process', async () => {
      await safeProcess()
      await SafeBodyMembersModule.seedDao(DAO_C, NETWORK)
      expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: UNSEEN_SAFE })).to.equal(2)
    })
  })

  it('returns no DAOs for an empty Safe list even when Safe bodies are configured', async () => {
    expect(await SafeBodyMembersModule.findDaosWithSafeBody([], NETWORK)).to.deep.equal([])
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

  it('rolls back a failed owner seed and saves every owner on the next attempt', async () => {
    const thirdOwner = getAddress('0x351db905400412a538072563212b4ae7e23f96b8')
    const owners = [OWNER, SECOND_OWNER, thirdOwner]
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves(owners)
    const write = sandbox.stub(Models.SafeMember, 'updateOne').callThrough()
    write.onSecondCall().rejects(new Error('owner write failed'))

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(0)

    write.restore()
    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members(
      owners,
    )
  })

  it('rolls back the whole owner set when one base member write fails', async () => {
    const ensureBaseMember = BaseGovernance.ensureBaseMember as sinon.SinonStub
    ensureBaseMember.onFirstCall().resolves({})
    ensureBaseMember.onSecondCall().resolves(null)

    await expect(SafeBodyMembersModule.seedDao(DAO_A, NETWORK)).not.to.be.rejected

    expect(ensureBaseMember.firstCall.args[0]).to.equal(OWNER)
    expect(ensureBaseMember.secondCall.args[0]).to.equal(SECOND_OWNER)
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(0)

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledTwice).to.be.true
  })

  it('saves the whole owner set after a write conflict', async () => {
    const write = sandbox.stub(Models.SafeMember, 'updateOne').callThrough()
    write.onSecondCall().rejects(Object.assign(new Error('WriteConflict'), { code: 112 }))

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      OWNER,
      SECOND_OWNER,
    ])
  })

  it('does not throw when Safe discovery fails', async () => {
    sandbox.stub(SafeBodyMembersModule, 'getSafeAddresses').rejects(new Error('database down'))

    await expect(SafeBodyMembersModule.seedDao(DAO_A, NETWORK)).not.to.be.rejected
  })

  it('skips a body that is conclusively not a Safe', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves(null)

    await SafeBodyMembersModule.seedDao(DAO_A, NETWORK)

    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })
})
