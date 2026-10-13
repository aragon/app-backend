import { Models } from '@dbModels'
import { PermissionHandler } from '@handlers/permissionHandler'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeDaoAssociationsModule, { EXECUTE_PERMISSION_ID } from '@modules/safe/safeDaoAssociations'
import SafeFixture from '@test/lib/unit-dep/safe'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { type LogDescription, ZeroAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonSpy } from 'sinon'

const network = SafeFixture.network
const safeAddress = SafeFixture.safeAddress
const daoX = '0x1111111111111111111111111111111111111111' as HexAddress
const daoY = '0x2222222222222222222222222222222222222222' as HexAddress
const sppX = '0x3333333333333333333333333333333333333333' as HexAddress
const sppX2 = '0x4444444444444444444444444444444444444444' as HexAddress
const sppY = '0x5555555555555555555555555555555555555555' as HexAddress
const conditionAddress = '0x99c15471aB696Ad3a96fbD76d5d9Fe04A85cf20a' as HexAddress

describe('Safe roles across DAOs', function () {
  this.retries(2)
  let sandbox: SinonSandbox
  let owners: SinonSpy
  let sent: Array<{ queue: EnumQueueName; payload: any }>

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    owners = SafeFixture.watchOwners(sandbox)
    sent = SafeFixture.stubSafeQueues(sandbox)
  })

  afterEach(() => sandbox.restore())

  const hash = (block: number): HexAddress => `0x${block.toString(16).padStart(64, '0')}`

  const info = (
    daoAddress: HexAddress,
    blockNumber: number,
    eventName: string,
    transactionIndex = 0,
    logIndex = 0,
  ): ILogInfo => ({
    network,
    address: daoAddress,
    blockNumber,
    transactionHash: hash(blockNumber * 1000 + transactionIndex),
    transactionIndex,
    logIndex,
    eventName,
  })

  const seedDao = async (daoAddress: HexAddress) => {
    await Models.Dao.create({
      network,
      address: daoAddress,
      creatorAddress: SafeFixture.owners[0],
      transactionHash: hash(11799787),
      blockNumber: 11799787,
    })
  }

  const seedBody = async (daoAddress: HexAddress, sppAddress: HexAddress, blockNumber: number) => {
    await Models.Plugin.create({
      network,
      address: sppAddress,
      daoAddress,
      transactionHash: hash(blockNumber),
      blockNumber,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
      uninstalled: { status: false },
    })
    await Models.Setting.create({
      network,
      daoAddress,
      pluginAddress: sppAddress,
      transactionHash: hash(blockNumber),
      blockNumber,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: safeAddress, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
  }

  const reconcileBody = async (daoAddress: HexAddress, blockNumber: number) => {
    const result = await SafeDaoAssociationsModule.reconcileDao(
      daoAddress,
      network,
      info(daoAddress, blockNumber, 'SettingUpdated'),
    )
    expect(result.failed).to.equal(0)
    await SafeBodyMembersModule.seedDao(daoAddress, network)
  }

  const permission = (daoAddress: HexAddress, condition = ZeroAddress) =>
    ({
      args: { where: daoAddress, who: safeAddress, permissionId: EXECUTE_PERMISSION_ID, condition },
    }) as unknown as LogDescription

  const assertPermission = async (
    daoAddress: HexAddress,
    event: IEventLogPermission,
    ref: ILogInfo,
    condition = ZeroAddress,
  ) => {
    const rows = await Models.DaoPermission.find({
      network,
      daoAddress: ref.address,
      transactionHash: ref.transactionHash,
      transactionIndex: ref.transactionIndex,
      logIndex: ref.logIndex,
    })
    expect(rows).to.have.length(1)
    expect(rows[0]).to.include({
      network,
      daoAddress: ref.address,
      event,
      whoAddress: safeAddress,
      whereAddress: daoAddress,
      permissionId: EXECUTE_PERMISSION_ID,
      blockNumber: ref.blockNumber,
      transactionHash: ref.transactionHash,
      transactionIndex: ref.transactionIndex,
      logIndex: ref.logIndex,
      conditionAddress: condition === ZeroAddress ? null : condition,
    })
  }

  const grant = async (
    daoAddress: HexAddress,
    blockNumber: number,
    condition = ZeroAddress,
    transactionIndex = 0,
    logIndex = 0,
  ) => {
    const ref = info(daoAddress, blockNumber, 'Granted', transactionIndex, logIndex)
    await PermissionHandler.handleGrantOnDao(permission(daoAddress, condition), ref)
    await assertPermission(daoAddress, IEventLogPermission.Granted, ref, condition)
    return ref
  }

  const revoke = async (daoAddress: HexAddress, blockNumber: number, transactionIndex = 0, logIndex = 0) => {
    const ref = info(daoAddress, blockNumber, 'Revoked', transactionIndex, logIndex)
    await PermissionHandler.handleRevokeOnDao(permission(daoAddress), ref)
    await assertPermission(daoAddress, IEventLogPermission.Revoked, ref)
    return ref
  }

  const assertRows = async (
    expected: Array<{ daoAddress: HexAddress; status: IPluginStatus; isBody: boolean; isProcess: boolean }>,
  ) => {
    const rows = await Models.Plugin.find({ network, address: safeAddress, interfaceType: IPluginInterfaceType.safe })
    expect(rows).to.have.length(expected.length)
    for (const wanted of expected) {
      let found = 0
      for (const row of rows) {
        if (row.daoAddress !== wanted.daoAddress) continue
        found += 1
        expect(row.status).to.equal(wanted.status)
        expect(row.isBody).to.equal(wanted.isBody)
        expect(row.isProcess).to.equal(wanted.isProcess)
        expect(row.isSubPlugin).to.equal(false)
        expect(row.isSupported).to.equal(true)
        expect(row.uninstalled.status).to.equal(wanted.status === IPluginStatus.uninstalled)
      }
      expect(found).to.equal(1)
    }
  }

  const assertRetired = async (daoAddress: HexAddress, ref: ILogInfo) => {
    const row = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress })
    expect(row?.uninstalled).to.include({
      status: true,
      transactionHash: ref.transactionHash,
      blockNumber: ref.blockNumber,
    })
    expect(row?.conditionAddress).to.equal(null)
    expect(row?.conditionInterfaceType).to.equal(null)
    expect(await Models.PluginSlug.findPluginSlug(safeAddress, daoAddress, network)).to.equal(null)
  }

  const refreshCount = () => {
    let count = 0
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh && message.payload.params.address === safeAddress) count += 1
    }
    return count
  }

  it('a Safe that is only an SPP body gets a body row', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedBody(daoX, sppX, 11799788)
    await reconcileBody(daoX, 11799789)

    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: false }])
    await SafeFixture.assertOwners(owners)
    expect(refreshCount()).to.equal(1)
  })

  it('a Safe that is a body and holds Execute in the same DAO gets one row with both', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedBody(daoX, sppX, 11799788)
    await reconcileBody(daoX, 11799789)
    await grant(daoX, 11799790)

    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: true }])
  })

  it('a process keeps its row and condition when it becomes a body', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await grant(daoX, 11799788, conditionAddress)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true }])
    const before = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(before?.conditionAddress).to.equal(conditionAddress)

    await seedBody(daoX, sppX, 11799789)
    await reconcileBody(daoX, 11799790)

    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: true }])
    const after = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(after?.id).to.equal(before?.id)
    expect(after?.conditionAddress).to.equal(conditionAddress)
    expect(after?.conditionInterfaceType).to.equal(before?.conditionInterfaceType)
    expect(refreshCount()).to.equal(1)
  })

  it('the same Safe acts its own role in each DAO', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedDao(daoY)
    await grant(daoX, 11799788)
    await seedBody(daoY, sppY, 11799789)
    await reconcileBody(daoY, 11799790)

    await assertRows([
      { daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true },
      { daoAddress: daoY, status: IPluginStatus.installed, isBody: true, isProcess: false },
    ])
    await SafeFixture.assertOwners(owners)
    expect(refreshCount()).to.equal(2)
    let refresh
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refresh = message.payload.params
    }
    if (!refresh) throw new Error('Safe refresh was not sent')
    await SafeFixture.refresh(sandbox, refresh.network, refresh.address, refresh.historyPages, 3)
    expect(await Models.SafeAccount.countDocuments({ network, safeAddress })).to.equal(1)
    const executed = await Models.SafeTransaction.find({
      network,
      safeAddress,
      transactionHash: { $in: SafeFixture.executedTxHashes },
    })
    expect(executed).to.have.length(4)
    for (const transactionHash of SafeFixture.executedTxHashes) {
      let found = 0
      for (const row of executed) {
        if (row.transactionHash === transactionHash) found += 1
      }
      expect(found).to.equal(1)
    }
  })

  it('a body stays while another SPP of the DAO still lists it', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedBody(daoX, sppX, 11799788)
    await seedBody(daoX, sppX2, 11799789)
    await reconcileBody(daoX, 11799790)

    await Models.Plugin.updateOne(
      { network, address: sppX, daoAddress: daoX },
      { $set: { status: IPluginStatus.uninstalled } },
    )
    await reconcileBody(daoX, 11799791)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: false }])

    await Models.Plugin.updateOne(
      { network, address: sppX2, daoAddress: daoX },
      { $set: { status: IPluginStatus.uninstalled } },
    )
    await reconcileBody(daoX, 11799792)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, info(daoX, 11799792, 'SettingUpdated'))
  })

  it('losing Execute keeps the body role', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedDao(daoY)
    await seedBody(daoX, sppX, 11799788)
    await reconcileBody(daoX, 11799789)
    await seedBody(daoY, sppY, 11799790)
    await reconcileBody(daoY, 11799791)
    await grant(daoX, 11799792, conditionAddress)
    await assertRows([
      { daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: true },
      { daoAddress: daoY, status: IPluginStatus.installed, isBody: true, isProcess: false },
    ])
    const before = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(before?.conditionAddress).to.equal(conditionAddress)
    const yBefore = await Models.Plugin.findOne({ network, daoAddress: daoY, address: safeAddress })
    await revoke(daoX, 11799793)

    await assertRows([
      { daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: false },
      { daoAddress: daoY, status: IPluginStatus.installed, isBody: true, isProcess: false },
    ])
    const yAfter = await Models.Plugin.findOne({ network, daoAddress: daoY, address: safeAddress })
    expect(yAfter?.updatedAt?.getTime()).to.equal(yBefore?.updatedAt?.getTime())
    const after = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(after?.id).to.equal(before?.id)
    expect(after?.conditionAddress).to.equal(null)
    expect(after?.conditionInterfaceType).to.equal(null)
  })

  it('removing the Safe from its active setting retires its body row', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedBody(daoX, sppX, 11799788)
    await reconcileBody(daoX, 11799789)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: true, isProcess: false }])
    expect(await Models.PluginSlug.findPluginSlug(safeAddress, daoX, network)).to.exist

    const changed = await Models.Setting.updateOne(
      { network, daoAddress: daoX, pluginAddress: sppX, status: ISettingStatus.active },
      { $set: { stages: [{ stageIndex: 0, plugins: [] }] } },
    )
    expect(changed.modifiedCount).to.equal(1)
    await reconcileBody(daoX, 11799790)

    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, info(daoX, 11799790, 'SettingUpdated'))
    const spp = await Models.Plugin.findOne({ network, address: sppX, daoAddress: daoX })
    expect(spp?.status).to.equal(IPluginStatus.installed)
    const setting = await Models.Setting.findOne({ network, daoAddress: daoX, pluginAddress: sppX })
    expect(setting?.status).to.equal(ISettingStatus.active)
  })

  it("losing the last role retires only that DAO's row", async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await seedDao(daoY)
    await grant(daoX, 11799788)
    await seedBody(daoY, sppY, 11799789)
    await reconcileBody(daoY, 11799790)
    const slugX = await Models.PluginSlug.findPluginSlug(safeAddress, daoX, network)
    const slugY = await Models.PluginSlug.findPluginSlug(safeAddress, daoY, network)
    expect(slugX).to.exist
    expect(slugY).to.exist
    const revoked = await revoke(daoX, 11799791)

    await assertRows([
      { daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false },
      { daoAddress: daoY, status: IPluginStatus.installed, isBody: true, isProcess: false },
    ])
    await assertRetired(daoX, revoked)
    const kept = await Models.PluginSlug.findPluginSlug(safeAddress, daoY, network)
    expect(kept?.toObject()).to.deep.equal(slugY!.toObject())
  })

  it('an old grant replayed after a revoke does not bring the process back', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await grant(daoX, 11799788)
    await revoke(daoX, 11799789)
    await grant(daoX, 11799788)

    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
  })

  it('a later transaction in the same block wins and a newer grant brings the process back', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await grant(daoX, 11799788, ZeroAddress, 0, 5)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true }])
    const before = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    const revoked = await revoke(daoX, 11799788, 1, 0)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, revoked)

    await grant(daoX, 11799788, ZeroAddress, 0, 5)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, revoked)

    await grant(daoX, 11799788, ZeroAddress, 2, 0)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true }])
    const after = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(after?.id).to.equal(before?.id)
    expect(after?.uninstalled.status).to.equal(false)
    expect(await Models.PluginSlug.findPluginSlug(safeAddress, daoX, network)).to.exist
    expect(await Models.DaoPermission.countDocuments({ network, daoAddress: daoX })).to.equal(3)
  })

  it('a later log in the same transaction wins and a newer grant brings the process back', async function () {
    this.timeout(300_000)
    await seedDao(daoX)
    await grant(daoX, 11799788, ZeroAddress, 0, 0)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true }])
    const before = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    const revoked = await revoke(daoX, 11799788, 0, 1)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, revoked)

    await grant(daoX, 11799788, ZeroAddress, 0, 0)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.uninstalled, isBody: false, isProcess: false }])
    await assertRetired(daoX, revoked)

    await grant(daoX, 11799788, ZeroAddress, 0, 2)
    await assertRows([{ daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true }])
    const after = await Models.Plugin.findSafeRow({ network, address: safeAddress, daoAddress: daoX })
    expect(after?.id).to.equal(before?.id)
    expect(after?.uninstalled.status).to.equal(false)
    expect(await Models.PluginSlug.findPluginSlug(safeAddress, daoX, network)).to.exist
    expect(await Models.DaoPermission.countDocuments({ network, daoAddress: daoX })).to.equal(3)
  })

  it('a foreign emitter cannot grant or revoke either DAO role', async function () {
    this.timeout(300_000)
    sandbox.stub(logger, 'warn')
    await seedDao(daoX)
    await seedDao(daoY)
    await grant(daoX, 11799788)
    await seedBody(daoY, sppY, 11799789)
    await reconcileBody(daoY, 11799790)
    await assertRows([
      { daoAddress: daoX, status: IPluginStatus.installed, isBody: false, isProcess: true },
      { daoAddress: daoY, status: IPluginStatus.installed, isBody: true, isProcess: false },
    ])
    const before = await Models.Plugin.find({ network, address: safeAddress }).sort({ daoAddress: 1 }).lean()
    const refreshes = refreshCount()

    for (const [daoAddress, emitter] of [
      [daoX, daoY],
      [daoY, daoX],
    ]) {
      for (const event of [IEventLogPermission.Granted, IEventLogPermission.Revoked]) {
        const ref = info(
          emitter,
          11799791,
          event,
          daoAddress === daoX ? 0 : 1,
          event === IEventLogPermission.Granted ? 0 : 1,
        )
        if (event === IEventLogPermission.Granted) {
          await PermissionHandler.handleGrantOnDao(permission(daoAddress), ref)
        } else {
          await PermissionHandler.handleRevokeOnDao(permission(daoAddress), ref)
        }
        await assertPermission(daoAddress, event, ref)
        const after = await Models.Plugin.find({ network, address: safeAddress }).sort({ daoAddress: 1 }).lean()
        expect(after).to.deep.equal(before)
        expect(refreshCount()).to.equal(refreshes)
      }
    }
  })
})
