import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import { SafeOwnerHandler } from '@handlers/safeOwnerHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance, MemberGovernanceFactory, SafeGovernance } from '@src/governance'
import { IPermission } from '@src/types/permission'
import {
  type HexAddress,
  IConditionInterfaceType,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { getAddress, Interface, id, ZeroHash } from 'ethers'
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
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves({})
    await seedDao(DAO_A, SPP_A, [SAFE, SAFE])
    await seedDao(DAO_B, SPP_B, [SAFE])
  })

  afterEach(() => sandbox?.restore())

  describe('findMemberDetail', () => {
    it('returns owner fields and global activity without plugin enrichment', async () => {
      await Models.SafeMember.ensure(NETWORK, SAFE, OWNER)
      await Models.Member.create({ address: OWNER, ens: 'alice.eth', avatar: 'avatar' })
      await Models.PluginMetrics.create({
        network: NETWORK,
        pluginAddress: SAFE,
        memberAddress: OWNER,
        daoAddress: DAO_A,
        voteCount: 9,
        firstActivity: 100,
        lastActivity: 200,
      })
      await Models.PluginMetrics.create({
        network: NETWORK,
        pluginAddress: SPP_B,
        memberAddress: OWNER,
        daoAddress: DAO_B,
        firstActivity: 50,
        lastActivity: 300,
      })

      const member = await new SafeGovernance(SAFE, NETWORK).findMemberDetail(OWNER)

      expect(member).to.include({
        address: OWNER,
        ens: 'alice.eth',
        avatar: 'avatar',
        metrics: null,
        tokenBalance: null,
        votingPower: null,
        currentDelegate: null,
        firstActive: 50,
        lastActive: 300,
      })
    })

    it('returns null for a member who is not an owner', async () => {
      await Models.Member.create({ address: OWNER })
      expect(await new SafeGovernance(SAFE, NETWORK).findMemberDetail(OWNER)).to.be.null
    })
  })

  describe('canCreate', () => {
    const network = NetworksEnum.ethereumSepolia
    const safe = '0x1111111111111111111111111111111111111111'
    const daoA = '0x2222222222222222222222222222222222222222'
    const owner = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
    const stranger = SECOND_OWNER
    const conditionAddress = '0x4444444444444444444444444444444444444444'

    let readOwners: sinon.SinonStub
    let isGranted: sinon.SinonStub

    const createSafeRow = (daoAddress: string, status = IPluginStatus.installed) =>
      Models.Plugin.create({
        id: `${safe}-${daoAddress}`,
        address: safe,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status,
        transactionHash: '0xtx',
        blockNumber: 1,
      })

    beforeEach(() => {
      readOwners = SafeChainReaderModule.readOwners as sinon.SinonStub
      readOwners.resolves([owner])
      isGranted = sandbox.stub(Web3Helper, 'isGranted').resolves(true)
    })

    it('lets an owner create from an allowed indexed selector without asking the DAO', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: IConditionInterfaceType.executeSelector })
      await Models.SelectorPermission.create({
        network,
        pluginAddress: safe,
        daoAddress: daoA,
        conditionAddress,
        transactionHash: '0xselector',
        transactionIndex: 0,
        blockNumber: 10,
        logIndex: 5,
        selector: '0x12345678',
        target: daoA,
        isAllowed: true,
      })

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.true
      expect(isGranted.called).to.be.false
    })

    it('blocks an owner when a later block-wide disallow beats an earlier allow', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: IConditionInterfaceType.executeSelector })
      await Models.SelectorPermission.create({
        network,
        pluginAddress: safe,
        daoAddress: daoA,
        conditionAddress,
        transactionHash: '0xallow',
        transactionIndex: 1,
        blockNumber: 10,
        logIndex: 5,
        selector: '0x12345678',
        target: daoA,
        chainId: 1,
        isAllowed: true,
      })
      await Models.SelectorPermission.create({
        network,
        pluginAddress: safe,
        daoAddress: daoA,
        conditionAddress,
        transactionHash: '0xselector',
        transactionIndex: 0,
        blockNumber: 10,
        logIndex: 7,
        selector: '0x12345678',
        target: daoA,
        chainId: 1,
        isAllowed: false,
        disallowed: { status: true, blockNumber: 10, logIndex: 7 },
      })

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.false
      expect(isGranted.called).to.be.false
    })

    it('lets an owner create when an execute-selector condition has no indexed rows', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: IConditionInterfaceType.executeSelector })

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.true
      expect(isGranted.called).to.be.false
    })

    it('asks the DAO about an SPP rule condition with empty execute calldata', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: IConditionInterfaceType.sppRule })

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.true
      expect(isGranted.calledOnce).to.be.true
      expect(isGranted.firstCall.args).to.deep.equal([
        daoA,
        daoA,
        safe,
        id(IPermission.EXECUTE_PERMISSION),
        network,
        new Interface(DAO.abi).encodeFunctionData('execute', [ZeroHash, [], 0]),
      ])
    })

    it('asks the DAO about an unknown condition with empty execute calldata', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: null })

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.true
      expect(isGranted.calledOnce).to.be.true
      expect(isGranted.firstCall.args).to.deep.equal([
        daoA,
        daoA,
        safe,
        id(IPermission.EXECUTE_PERMISSION),
        network,
        new Interface(DAO.abi).encodeFunctionData('execute', [ZeroHash, [], 0]),
      ])
    })

    it('throws when owners cannot be read', async () => {
      const plugin = await createSafeRow(daoA)
      await plugin.update({ conditionAddress, conditionInterfaceType: IConditionInterfaceType.executeSelector })
      readOwners.rejects(new Error('node down'))

      await expect(SafeGovernance.canCreate(owner, plugin)).to.be.rejectedWith('node down')
      expect(isGranted.called).to.be.false
    })

    it('should let an owner create when the Safe still holds execute, asked with an empty execute', async () => {
      const plugin = await createSafeRow(daoA)

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.true

      const executeSelector = new Interface(DAO.abi).getFunction('execute')!.selector
      expect(isGranted.firstCall.args[5].startsWith(executeSelector)).to.be.true
    })

    it('should not let someone who is not an owner create, without asking the DAO', async () => {
      const plugin = await createSafeRow(daoA)

      expect(await SafeGovernance.canCreate(stranger, plugin)).to.be.false
      expect(isGranted.notCalled).to.be.true
    })

    it('should not let an owner create once execute was revoked from the Safe', async () => {
      const plugin = await createSafeRow(daoA, IPluginStatus.uninstalled)

      expect(await SafeGovernance.canCreate(owner, plugin)).to.be.false
      expect(readOwners.notCalled).to.be.true
    })
  })

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

  it('adds missing owners and leaves the existing row alone', async () => {
    const existing = await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
    const existingRow = existing.toObject()
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([OWNER, SECOND_OWNER, THIRD_OWNER])

    const result = await new SafeGovernance(SAFE, NETWORK).reconcileOwners()
    const owners = await Models.SafeMember.find({ network: NETWORK, safeAddress: SAFE })

    expect(result).to.deep.equal({ added: 2, failed: 0 })
    expect(owners.map(owner => owner.memberAddress)).to.have.members([OWNER, SECOND_OWNER, THIRD_OWNER])
    expect((await Models.SafeMember.findOwner(NETWORK, SAFE, OWNER)).toObject()).to.deep.equal(existingRow)
  })

  it('writes nothing when the chain returns no owner list', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves(null)

    expect(await new SafeGovernance(SAFE, NETWORK).reconcileOwners()).to.deep.equal({ added: 0, failed: 0 })
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('counts a failed owner write and still adds the other owners', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).resolves([OWNER, SECOND_OWNER, THIRD_OWNER])
    const ensure = Models.SafeMember.ensure.bind(Models.SafeMember)
    sandbox.stub(Models.SafeMember, 'ensure').callsFake(async (network, safeAddress, memberAddress) => {
      if (memberAddress === SECOND_OWNER) throw new Error('write down')
      await ensure(network, safeAddress, memberAddress)
    })

    const result = await new SafeGovernance(SAFE, NETWORK).reconcileOwners()
    const owners = await Models.SafeMember.find({ network: NETWORK, safeAddress: SAFE })

    expect(result).to.deep.equal({ added: 2, failed: 1 })
    expect(owners.map(owner => owner.memberAddress)).to.have.members([OWNER, THIRD_OWNER])
    expect(await Models.SafeMember.findOwner(NETWORK, SAFE, SECOND_OWNER)).to.equal(null)
  })

  it('keeps stored owners that the chain no longer lists', async () => {
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: THIRD_OWNER })

    expect(await new SafeGovernance(SAFE, NETWORK).reconcileOwners()).to.deep.equal({ added: 2, failed: 0 })
    const owners = await Models.SafeMember.find({ network: NETWORK, safeAddress: SAFE })
    expect(owners.map(owner => owner.memberAddress)).to.have.members([OWNER, SECOND_OWNER, THIRD_OWNER])
  })

  it('requests DAO metrics only when it adds an owner', async () => {
    const metrics = sandbox.stub(BaseGovernance, 'requestDaoMetrics').resolves()
    const governance = new SafeGovernance(SAFE, NETWORK)

    expect(await governance.reconcileOwners()).to.deep.equal({ added: 2, failed: 0 })
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(metrics.callCount).to.equal(2)
    expect(metrics.calledWithExactly(DAO_A, NETWORK)).to.be.true
    expect(metrics.calledWithExactly(DAO_B, NETWORK)).to.be.true

    metrics.resetHistory()

    expect(await governance.reconcileOwners()).to.deep.equal({ added: 0, failed: 0 })
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(metrics.called).to.be.false
  })
})
