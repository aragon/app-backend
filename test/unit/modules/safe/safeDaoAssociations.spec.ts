import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import { IPermission } from '@src/types/permission'
import { DaoList } from '@test/mock/fakeDao'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { PluginList } from '@test/mock/fakePlugins'
import { fakeSettings } from '@test/mock/fakeSettings'
import {
  IConditionInterfaceType,
  IEventLogPermission,
  IPluginInterfaceType,
  IPluginStatus,
  ISafeTransactionState,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = DaoList[0].address
const OTHER_DAO = '0x1111111111111111111111111111111111111111'
const SAFE = '0x2222222222222222222222222222222222222222'
const OTHER_SAFE = '0x3333333333333333333333333333333333333333'
const THIRD_SAFE = '0x5555555555555555555555555555555555555555'
const SPP = PluginList[0].address
const OTHER_SPP = '0x4444444444444444444444444444444444444444'
const OWNER = DaoList[0].creatorAddress
const body = {
  address: SAFE,
  brandId: VotingBodyBrandIdentity.SAFE,
  proposalType: 7,
  proposalCreationConditionAddress: OWNER,
}
const ref = (blockNumber = 10, transactionIndex = 0, logIndex = 0) => ({
  blockNumber,
  transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
  transactionIndex,
  logIndex,
})
const association = { network: NETWORK, daoAddress: DAO, address: SAFE, interfaceType: IPluginInterfaceType.safe }

describe('Module: safe/safeDaoAssociations', () => {
  let sandbox: sinon.SinonSandbox
  let isSafe: sinon.SinonStub

  const seedSpp = async (daoAddress = DAO, address = SPP) => {
    await Models.Plugin.create({
      ...PluginList[0],
      id: `${daoAddress}-${address}`,
      network: NETWORK,
      daoAddress,
      address,
      interfaceType: IPluginInterfaceType.spp,
      tokenAddress: null,
    })
    return Models.Setting.create({
      ...fakeSettings,
      transactionHash: `0x${address.slice(2).padEnd(64, '0')}`,
      network: NETWORK,
      daoAddress,
      pluginAddress: address,
      stages: [{ stageIndex: 0, name: 'Approval', plugins: [body] }],
    })
  }

  const permission = (
    event: IEventLogPermission,
    blockNumber: number,
    transactionIndex = 0,
    logIndex = 0,
    whoAddress = SAFE,
  ) =>
    Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      ...ref(blockNumber, transactionIndex, logIndex),
      network: NETWORK,
      daoAddress: DAO,
      whereAddress: DAO,
      whoAddress,
      transactionHash: `0x${whoAddress.slice(2)}${blockNumber.toString(16).padStart(24, '0')}`,
      permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
      event,
    })

  const reconcile = (blockNumber = 10) => SafeDaoAssociationsModule.reconcileDao(DAO, NETWORK, ref(blockNumber))

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    isSafe = sandbox.stub(SafeChainReaderModule, 'isSafe').rejects(new Error('Execute grants need a Safe probe'))
    await Models.Dao.create({ ...DaoList[0], network: NETWORK })
    await seedSpp()
  })

  afterEach(() => sandbox.restore())

  it('skips a persisted Execute grant when the DAO is not registered', async () => {
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      ...ref(),
      network: NETWORK,
      daoAddress: OTHER_DAO,
      whereAddress: OTHER_DAO,
      whoAddress: OTHER_SAFE,
      permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
      event: IEventLogPermission.Granted,
    })
    isSafe.resolves(true)

    expect(await SafeDaoAssociationsModule.reconcileDao(OTHER_DAO, NETWORK, ref())).to.deep.equal({
      changed: 0,
      failed: 0,
    })

    expect(await Models.Plugin.countDocuments({ daoAddress: OTHER_DAO, network: NETWORK })).to.equal(0)
    expect(await Models.DaoPermission.countDocuments({ daoAddress: OTHER_DAO, network: NETWORK })).to.equal(1)
  })

  it('creates a row for a body-only Safe', async () => {
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 0 })
    const row = await Models.Plugin.findOne(association).lean()
    expect(row).to.include({
      id: `${NETWORK}-${ref().transactionHash}-${SAFE}-${DAO}`,
      status: IPluginStatus.installed,
      isSupported: true,
      isBody: true,
      isProcess: false,
      isSubPlugin: false,
      parentPlugin: null,
      stageIndex: null,
      blockNumber: ref().blockNumber,
      transactionHash: ref().transactionHash,
      blockTimestamp: 1620000000,
    })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.have.property('slug', 'safe')
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.countDocuments(association)).to.equal(1)
  })

  it('backfills a body-only Safe until it has synced history', async () => {
    const backfill = sandbox.stub(SafeDaoAssociationsModule, 'queueBackfill').resolves()
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 0 })
    expect(backfill.calledOnceWithExactly(NETWORK, SAFE)).to.be.true

    backfill.resetHistory()
    const account = await Models.SafeAccount.ensure(NETWORK, SAFE)
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(backfill.calledOnceWithExactly(NETWORK, SAFE)).to.be.true

    backfill.resetHistory()
    await Models.SafeAccount.stamp(account.id, 'historyFetchedAt', Date.now())
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(backfill.called).to.be.false
  })

  it('reconciles one ordinary API record across SPP and Execute capability transitions', async () => {
    await Models.Dao.create({ ...DaoList[0], network: NETWORK, address: OTHER_DAO })
    await seedSpp(OTHER_DAO, OTHER_SPP)
    await SafeDaoAssociationsModule.reconcileDao(OTHER_DAO, NETWORK, ref())
    await Models.SafeMember.create({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
    await Models.SafeTransaction.create({
      id: `${NETWORK}-${SAFE}-0xtx`,
      network: NETWORK,
      safeAddress: SAFE,
      safeTxHash: '0xtx',
      nonce: '1',
      state: ISafeTransactionState.live,
      to: DAO,
      refreshedAt: new Date(),
    })
    const settingBefore = await Models.Setting.findOne({ daoAddress: DAO }).lean()
    await reconcile()
    const first = await Models.Plugin.findOne(association).lean()
    const apiDao = await Models.Dao.getDaoDetails(DAO, NETWORK)
    expect(apiDao.plugins.find(plugin => plugin.address === SAFE)).to.include({
      address: SAFE,
      daoAddress: DAO,
      isBody: true,
      isProcess: false,
    })
    expect(apiDao.plugins.find(plugin => plugin.address === SPP).settings.stages[0].plugins[0]).to.include(body)

    await permission(IEventLogPermission.Granted, 11)
    await Models.Plugin.updateOne(association, {
      conditionAddress: OWNER,
      conditionInterfaceType: IConditionInterfaceType.executeSelector,
    })
    expect(await reconcile(11)).to.deep.equal({ changed: 1, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      id: first.id,
      isBody: true,
      isProcess: true,
      conditionAddress: OWNER,
      conditionInterfaceType: IConditionInterfaceType.executeSelector,
    })

    await permission(IEventLogPermission.Revoked, 12)
    await reconcile(12)
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      id: first.id,
      status: IPluginStatus.installed,
      isBody: true,
      isProcess: false,
      conditionAddress: null,
      conditionInterfaceType: null,
    })

    await Models.Plugin.updateOne({ address: SPP, daoAddress: DAO }, { status: IPluginStatus.uninstalled })
    await permission(IEventLogPermission.Granted, 13)
    await reconcile(13)
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      id: first.id,
      status: IPluginStatus.installed,
      isBody: false,
      isProcess: true,
    })

    await Models.Plugin.updateOne(association, {
      conditionAddress: OWNER,
      conditionInterfaceType: IConditionInterfaceType.executeSelector,
    })
    await permission(IEventLogPermission.Revoked, 14)
    expect(await reconcile(14)).to.deep.equal({ changed: 1, failed: 0 })
    const retired = await Models.Plugin.findOne(association).lean()
    expect(retired).to.include({
      id: first.id,
      status: IPluginStatus.uninstalled,
      isBody: false,
      isProcess: false,
      conditionAddress: null,
      conditionInterfaceType: null,
    })
    expect(retired.uninstalled).to.include({ status: true, blockNumber: 14, transactionHash: ref(14).transactionHash })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.be.null
    expect(await reconcile(15)).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.findOne({ ...association, daoAddress: OTHER_DAO }).lean()).to.include({
      status: IPluginStatus.installed,
      isBody: true,
      isProcess: false,
    })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, OTHER_DAO, NETWORK)).to.exist
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(1)
    expect(await Models.SafeTransaction.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(1)
    expect((await Models.Setting.findOne({ daoAddress: DAO }).lean()).stages).to.deep.equal(settingBefore.stages)
  })

  it('backfills duplicate SPP references once and upgrades the same row when Execute is granted', async () => {
    await Models.Setting.updateOne(
      { daoAddress: DAO },
      {
        stages: [
          { stageIndex: 0, plugins: [body, body] },
          { stageIndex: 1, plugins: [body] },
        ],
      },
    )
    await seedSpp(DAO, OTHER_SPP)
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 0 })
    const first = await Models.Plugin.findOne(association).lean()
    await permission(IEventLogPermission.Granted, 11)
    expect(await reconcile(11)).to.deep.equal({ changed: 1, failed: 0 })
    expect(await reconcile(11)).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({ id: first.id, isBody: true, isProcess: true })
    expect(await Models.Plugin.countDocuments(association)).to.equal(1)
    expect(await Models.PluginSlug.countDocuments({ daoAddress: DAO, pluginAddress: SAFE, network: NETWORK })).to.equal(
      1,
    )
  })

  it('gives no row to a body whose SPP is installed only in another DAO', async () => {
    await Models.Plugin.updateOne({ address: SPP }, { daoAddress: OTHER_DAO })
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.countDocuments(association)).to.equal(0)
  })

  it('ignores a legacy setting without a DAO address', async () => {
    await Models.Setting.updateOne({ daoAddress: DAO }, { daoAddress: null })
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.countDocuments(association)).to.equal(0)
  })

  it('retires a body row when its SPP is uninstalled', async () => {
    await reconcile()
    await Models.Plugin.updateOne({ address: SPP }, { status: IPluginStatus.uninstalled })
    expect(await reconcile(11)).to.deep.equal({ changed: 1, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      status: IPluginStatus.uninstalled,
      isBody: false,
      isProcess: false,
    })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.be.null
  })

  it('keeps the body row while another installed SPP of the DAO still lists the Safe', async () => {
    await seedSpp(DAO, OTHER_SPP)
    await reconcile()
    await Models.Plugin.updateOne({ address: SPP, daoAddress: DAO }, { status: IPluginStatus.uninstalled })
    expect(await reconcile(11)).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      status: IPluginStatus.installed,
      isBody: true,
      isProcess: false,
    })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.have.property('slug', 'safe')

    await Models.Plugin.updateOne({ address: OTHER_SPP, daoAddress: DAO }, { status: IPluginStatus.uninstalled })
    expect(await reconcile(12)).to.deep.equal({ changed: 1, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({ status: IPluginStatus.uninstalled })
  })

  it('reinstalls the same body row and restores its slug when the SPP returns', async () => {
    await reconcile()
    const first = await Models.Plugin.findOne(association).lean()
    await Models.Plugin.updateOne({ address: SPP }, { status: IPluginStatus.uninstalled })
    await reconcile(11)
    await Models.Plugin.updateOne({ address: SPP }, { status: IPluginStatus.installed })

    expect(await reconcile(12)).to.deep.equal({ changed: 1, failed: 0 })
    const row = await Models.Plugin.findOne(association).lean()
    expect(row).to.include({ id: first.id, status: IPluginStatus.installed, isBody: true, isProcess: false })
    expect(row.uninstalled.status).to.be.false
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.have.property('slug', 'safe')
    expect(await Models.Plugin.countDocuments(association)).to.equal(1)
  })

  it('retires the slug on the next reconcile when the first delete failed', async () => {
    await reconcile()
    await Models.Plugin.updateOne({ address: SPP }, { status: IPluginStatus.uninstalled })
    const remove = sandbox.stub(PluginSlug, 'deleteSlug').callThrough()
    remove.onFirstCall().resolves(false)
    expect(await reconcile(11)).to.deep.equal({ changed: 1, failed: 1 })
    expect(await Models.Plugin.findOne(association)).to.have.property('status', IPluginStatus.uninstalled)
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.exist
    expect(await reconcile(12)).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.be.null
    expect((await Models.Plugin.findOne(association)).uninstalled.blockNumber).to.equal(11)
  })

  it('clears parentPlugin and stageIndex on a body row', async () => {
    await reconcile()
    await Models.Plugin.updateOne(association, { isSubPlugin: true, parentPlugin: SPP, stageIndex: 2 })
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      isSubPlugin: false,
      parentPlugin: null,
      stageIndex: null,
    })
  })

  it('counts a failed row write and still handles the other Safes', async () => {
    await Models.Setting.updateOne(
      { daoAddress: DAO },
      {
        stages: [{ stageIndex: 0, plugins: [body, { ...body, address: OTHER_SAFE }] }],
      },
    )
    sandbox
      .stub(DbOperations, 'createDocument')
      .callThrough()
      .withArgs(Models.Plugin, sinon.match({ address: SAFE }))
      .resolves(null)
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 1 })
    expect(await Models.Plugin.countDocuments(association)).to.equal(0)
    expect(await Models.Plugin.findOne({ ...association, address: OTHER_SAFE }).lean()).to.include({
      status: IPluginStatus.installed,
      isBody: true,
      isProcess: false,
    })
    expect(await Models.PluginSlug.findPluginSlug(OTHER_SAFE, DAO, NETWORK)).to.exist
  })

  it('counts a saved row when its slug fails and repairs the slug on replay', async () => {
    const slug = sandbox.stub(PluginSlug, 'generateSlug').callThrough()
    slug.onFirstCall().resolves(null)
    expect(await reconcile()).to.deep.equal({ changed: 1, failed: 1 })
    expect(await Models.Plugin.findOne(association)).to.exist
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.be.null
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.PluginSlug.findPluginSlug(SAFE, DAO, NETWORK)).to.exist
  })

  it('leaves a row with another interface alone', async () => {
    const existing = await Models.Plugin.create({
      ...PluginList[0],
      ...association,
      id: 'other-interface',
      interfaceType: IPluginInterfaceType.multisig,
    })
    expect(await reconcile()).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.countDocuments(association)).to.equal(0)
    expect((await Models.Plugin.findById(existing._id)).toObject()).to.deep.equal(existing.toObject())
  })

  it('adds held Execute grantees as process candidates', async () => {
    await permission(IEventLogPermission.Granted, 11, 0, 0, OTHER_SAFE)
    await permission(IEventLogPermission.Granted, 12, 0, 0, THIRD_SAFE)
    isSafe.resolves(true)

    expect(await reconcile()).to.deep.equal({ changed: 3, failed: 0 })
    for (const address of [OTHER_SAFE, THIRD_SAFE]) {
      expect(await Models.Plugin.findOne({ ...association, address }).lean()).to.include({
        status: IPluginStatus.installed,
        isBody: false,
        isProcess: true,
      })
    }
    expect(isSafe.callCount).to.equal(2)
  })

  it('counts a failed Safe probe and still creates the other held process', async () => {
    await permission(IEventLogPermission.Granted, 11, 0, 0, OTHER_SAFE)
    await permission(IEventLogPermission.Granted, 12, 0, 0, THIRD_SAFE)
    isSafe.withArgs(NETWORK, OTHER_SAFE).rejects(new Error('node down'))
    isSafe.withArgs(NETWORK, THIRD_SAFE).resolves(true)

    expect(await reconcile()).to.deep.equal({ changed: 2, failed: 1 })
    expect(await Models.Plugin.findOne({ ...association, address: OTHER_SAFE })).to.be.null
    expect(await Models.Plugin.findOne({ ...association, address: THIRD_SAFE }).lean()).to.include({
      status: IPluginStatus.installed,
      isProcess: true,
    })
  })

  it('uses the later log index when a grant follows a revoke in the same block', async () => {
    await reconcile()
    await permission(IEventLogPermission.Revoked, 20, 2, 3)

    expect(
      await SafeDaoAssociationsModule.reconcileDao(DAO, NETWORK, ref(20, 2, 4), {
        safeAddress: SAFE,
        event: IEventLogPermission.Granted,
      }),
    ).to.deep.equal({ changed: 1, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({ isBody: true, isProcess: true })
  })

  it('keeps the persisted revoke when an older grant is replayed', async () => {
    await reconcile()
    await permission(IEventLogPermission.Revoked, 20, 2, 3)

    expect(
      await SafeDaoAssociationsModule.reconcileDao(DAO, NETWORK, ref(20, 2, 2), {
        safeAddress: SAFE,
        event: IEventLogPermission.Granted,
      }),
    ).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({ isBody: true, isProcess: false })
  })

  it('uses the latest Execute event when duplicate grants include a later revoke', async () => {
    await reconcile()
    await permission(IEventLogPermission.Granted, 20, 1, 1)
    await permission(IEventLogPermission.Revoked, 20, 1, 2)

    expect(await reconcile(21)).to.deep.equal({ changed: 0, failed: 0 })
    expect(await Models.Plugin.findOne(association).lean()).to.include({
      status: IPluginStatus.installed,
      isBody: true,
      isProcess: false,
    })
  })
})
