import config from '@config'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import { PluginHandler } from '@handlers/pluginHandler'
import ContractHelper from '@helpers/contractHelper'
import PluginDetector from '@helpers/pluginDetector'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import SafeProcessModule from '@modules/safe/safeProcess'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { PluginList } from '@test/mock/fakePlugins'
import { fakeSettings } from '@test/mock/fakeSettings'
import {
  EnumQueueName,
  IEventLogPermission,
  IPluginInterfaceType,
  IPluginStatus,
  ISafeTransactionState,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: safe/safeProcess', () => {
  let sandbox: SinonSandbox
  let errorStub: sinon.SinonStub
  let warnStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
    sandbox.stub(logger, 'verbose')
    warnStub = sandbox.stub(logger, 'warn')
    errorStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => sandbox.restore())

  const seedBody = async (daoAddress: string, safeAddress: string, network: NetworksEnum) => {
    const sppAddress = PluginList[0].address
    await Models.Plugin.create({
      ...PluginList[0],
      id: `${daoAddress}-${sppAddress}`,
      address: sppAddress,
      daoAddress,
      network,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      tokenAddress: null,
    })
    await Models.Setting.create({
      ...fakeSettings,
      transactionHash: '0xsetting',
      network,
      daoAddress,
      pluginAddress: sppAddress,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: safeAddress, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
  }

  const createExecuteEvent = (
    daoAddress: string,
    safeAddress: string,
    network: NetworksEnum,
    event: IEventLogPermission,
    blockNumber: number,
  ) =>
    Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress,
      whereAddress: daoAddress,
      whoAddress: safeAddress,
      permissionId: ethers.id('EXECUTE_PERMISSION'),
      event,
      blockNumber,
      transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
      transactionIndex: 0,
      logIndex: 0,
      conditionAddress: null,
    })

  describe('install', () => {
    const daoAddress = '0x1111111111111111111111111111111111111111'
    const safeAddress = '0x2222222222222222222222222222222222222222'
    const network = NetworksEnum.ethereumSepolia
    const info = { address: daoAddress, network, transactionHash: '0xtxhash', blockNumber: 1234 } as any

    const createRow = (interfaceType: IPluginInterfaceType, status: IPluginStatus) =>
      Models.Plugin.create({
        id: 'existing-row',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType,
        status,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })

    const safeProxyCode = `0x${PluginDetector._generateFunctionHash(PluginDetector.SAFE_WALLET).slice(2)}`

    let seedDao: sinon.SinonStub
    let getBytecode: sinon.SinonStub
    let readOwners: sinon.SinonStub
    let sendMessage: sinon.SinonStub
    let findDao: sinon.SinonStub

    beforeEach(() => {
      findDao = sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: daoAddress } as any)
      sandbox.stub(PluginSlug, 'generateSlug').resolves('safe')
      seedDao = sandbox.stub(SafeBodyMembersModule, 'seedDao').resolves()
      getBytecode = sandbox.stub(ContractHelper, 'getBytecode').resolves(safeProxyCode)
      readOwners = sandbox
        .stub(SafeChainReaderModule, 'readOwners')
        .resolves(['0x4444444444444444444444444444444444444444'])
      sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    })

    it('installs nothing for a Granted from an address that is not a DAO', async () => {
      const emitter = '0x3333333333333333333333333333333333333333'
      ;(Models.Dao.findByAddress as sinon.SinonStub).resolves(null)

      const result = await SafeProcessModule.install(emitter, safeAddress, { ...info, address: emitter })
      expect(result).to.be.undefined

      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
      expect(getBytecode.notCalled).to.be.true
      expect(seedDao.notCalled).to.be.true
      expect(sendMessage.notCalled).to.be.true
    })

    it('registers the Safe as a DAO process and seeds its owners', async () => {
      await SafeProcessModule.install(daoAddress, safeAddress, info)

      const plugin = await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()
      expect(plugin).to.include({
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        isBody: false,
        isSubPlugin: false,
        isSupported: true,
        id: `${network}-${info.transactionHash}-${safeAddress}-${daoAddress}`,
      })
      expect(seedDao.calledOnceWith(daoAddress, network)).to.be.true
    })

    it('creates the Safe row and seeds owners when the latest grant is replayed', async () => {
      const grant = await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10)
      const replayInfo = {
        ...info,
        blockNumber: grant.blockNumber,
        transactionHash: grant.transactionHash,
        transactionIndex: grant.transactionIndex,
        logIndex: grant.logIndex,
      }
      expect(await Models.Plugin.countDocuments({ address: safeAddress, daoAddress, network })).to.equal(0)

      await SafeProcessModule.install(daoAddress, safeAddress, replayInfo)

      expect(await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()).to.include({
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
      })
      expect(seedDao.calledOnceWithExactly(daoAddress, network)).to.be.true
      expect(sendMessage.calledOnceWith(EnumQueueName.safeRefresh)).to.be.true
    })

    it('skips the Safe when the DAO is not registered', async () => {
      findDao.resolves(null)

      expect(await SafeProcessModule.install(daoAddress, safeAddress, info)).to.be.undefined

      expect(await Models.Plugin.countDocuments({ address: safeAddress, daoAddress, network })).to.equal(0)
      expect(seedDao.notCalled).to.be.true
    })

    it('skips an address without the Safe selector', async () => {
      getBytecode.resolves('0x6080604052')

      expect(await SafeProcessModule.install(daoAddress, safeAddress, info)).to.be.undefined

      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
      expect(seedDao.notCalled).to.be.true
    })

    it('skips a contract with the Safe selector but no owners', async () => {
      readOwners.resolves(null)

      expect(await SafeProcessModule.install(daoAddress, safeAddress, info)).to.be.undefined

      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
      expect(seedDao.notCalled).to.be.true
    })

    it('leaves a row with another interface alone', async () => {
      await createRow(IPluginInterfaceType.multisig, IPluginStatus.installed)

      expect(await SafeProcessModule.install(daoAddress, safeAddress, info)).to.be.undefined

      const plugin = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(plugin?.interfaceType).to.equal(IPluginInterfaceType.multisig)
      expect(getBytecode.notCalled).to.be.true
    })

    it('a regrant on a body row turns the process on', async () => {
      const existing = await createRow(IPluginInterfaceType.safe, IPluginStatus.installed)
      await existing.update({ isBody: true, isProcess: false })
      await seedBody(daoAddress, safeAddress, network)

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      const plugin = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(plugin).to.include({ status: IPluginStatus.installed, isBody: true, isProcess: true })
      expect(seedDao.calledOnce).to.be.true
    })

    it('gives a second DAO its own row and leaves the revoked row alone', async () => {
      const otherDao = '0x3333333333333333333333333333333333333333'
      await createRow(IPluginInterfaceType.safe, IPluginStatus.uninstalled)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)

      await PluginHandler.installPluginOnPermissionGranted(otherDao, safeAddress, { ...info, address: otherDao })
      await SafeProcessModule.install(otherDao, safeAddress, { ...info, address: otherDao })

      const rows = await Models.Plugin.find({ address: safeAddress }).lean()
      expect(rows.map(row => [row.daoAddress, row.status])).to.have.deep.members([
        [daoAddress, IPluginStatus.uninstalled],
        [otherDao, IPluginStatus.installed],
      ])
    })

    it('logs a failed code read and returns false', async () => {
      getBytecode.rejects(new Error('node down'))
      const result = await SafeProcessModule.install(daoAddress, safeAddress, info)

      expect(result).to.be.false
      expect(errorStub.calledOnceWith('Unable to activate Safe association' as any)).to.be.true
      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
    })

    for (const failure of ['owner read', 'null create', 'null update', 'post-install', 'reconciliation']) {
      it(`returns false on ${failure} failure`, async () => {
        if (failure === 'owner read') readOwners.rejects(new Error('node down'))
        if (failure === 'null create') sandbox.stub(DbOperations, 'createDocument').resolves(null)
        if (failure === 'null update') {
          await createRow(IPluginInterfaceType.safe, IPluginStatus.uninstalled)
          sandbox.stub(DbOperations, 'updateDocument').resolves(null)
        }
        if (failure === 'post-install') seedDao.rejects(new Error('seed failed'))
        if (failure === 'reconciliation') {
          sandbox.stub(SafeDaoAssociationsModule, 'reconcileDao').resolves({ changed: 1, failed: 1 })
        }

        expect(await SafeProcessModule.install(daoAddress, safeAddress, info)).to.be.false
        if (failure !== 'post-install') {
          expect(seedDao.notCalled).to.be.true
          expect(sendMessage.notCalled).to.be.true
        }
        if (failure === 'null update') {
          expect((await Models.Plugin.findOne({ address: safeAddress }))?.status).to.equal(IPluginStatus.uninstalled)
        } else if (failure !== 'post-install') {
          expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
        }
      })
    }

    it('puts the history depth in the refresh id on reinstall', async () => {
      await createRow(IPluginInterfaceType.safe, IPluginStatus.uninstalled)

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      expect(sendMessage.calledOnceWith(EnumQueueName.safeRefresh)).to.be.true
      const historyPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
      expect(historyPages).to.be.greaterThan(1)
      expect(sendMessage.firstCall.args[1]).to.deep.equal({
        id: `safe-refresh-${network}-${safeAddress}-${historyPages}`,
        params: { network, address: safeAddress, historyPages },
      })
    })
  })

  describe('uninstall', () => {
    beforeEach(() => {
      sandbox
        .stub(Models.Dao, 'findByAddress')
        .resolves({ address: '0x1111111111111111111111111111111111111111' } as any)
    })

    it('ignores a revoke emitted by another contract', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      const plugin = await Models.Plugin.create({
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      const info = {
        address: '0x3333333333333333333333333333333333333333',
        network,
        transactionHash: '0x0123',
        blockNumber: 12345,
      } as any
      const deleteSlug = sandbox.stub(PluginSlug, 'deleteSlug').resolves()
      const metrics = sandbox.spy(BaseGovernance, 'requestDaoMetrics')

      const result = await SafeProcessModule.uninstall(plugin, info)

      const stored = await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()
      expect(result).to.be.undefined
      expect(stored?.status).to.equal(IPluginStatus.installed)
      expect(stored?.uninstalled.status).to.be.false
      expect(deleteSlug.notCalled).to.be.true
      expect(metrics.notCalled).to.be.true
      expect(warnStub.calledOnceWith('Ignoring Safe revoke from a foreign emitter' as any)).to.be.true
      expect(errorStub.notCalled).to.be.true
    })

    it('keeps the Safe installed as a body when Execute is revoked but its SPP parent remains active', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      await seedBody(daoAddress, safeAddress, network)
      const plugin = await Models.Plugin.create({
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        isBody: false,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10)
      const info = {
        address: daoAddress,
        network,
        transactionHash: '0x0123',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 11,
      } as any
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const metrics = sandbox.spy(BaseGovernance, 'requestDaoMetrics')

      const result = await SafeProcessModule.uninstall(plugin, info)

      const stored = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(stored).to.include({ status: IPluginStatus.installed, isBody: true, isProcess: false })
      expect(stored.conditionAddress).to.be.null
      expect(stored.conditionInterfaceType).to.be.null
      expect(result?.id).to.equal(plugin.id)
      expect(metrics.calledOnceWith(daoAddress, network)).to.be.true
      expect(sendMessage.calledOnceWith(EnumQueueName.daoMetrics)).to.be.true
      expect(sendMessage.firstCall.args[1]).to.deep.equal({
        id: daoAddress,
        params: { address: daoAddress, network },
      })
    })

    it('retires the row and keeps owners and transactions when neither holds', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const plugin = await Models.Plugin.create({
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        isBody: false,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10)
      await Models.SafeMember.create({
        network,
        safeAddress,
        memberAddress: '0x4444444444444444444444444444444444444444',
      })
      await Models.SafeTransaction.create({
        id: `${network}-${safeAddress}-0xtx`,
        network,
        safeAddress,
        safeTxHash: '0xtx',
        nonce: '1',
        state: ISafeTransactionState.live,
        to: daoAddress,
        refreshedAt: new Date(),
      })
      const info = {
        address: daoAddress,
        network,
        transactionHash: '0x0123',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 11,
      } as any

      const result = await SafeProcessModule.uninstall(plugin, info)

      const stored = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(stored).to.include({ status: IPluginStatus.uninstalled, isBody: false, isProcess: false })
      expect(stored.uninstalled).to.include({ status: true, transactionHash: info.transactionHash, blockNumber: 11 })
      expect(result?.id).to.equal(plugin.id)
      expect(await Models.SafeMember.countDocuments({ network, safeAddress })).to.equal(1)
      expect(await Models.SafeTransaction.countDocuments({ network, safeAddress })).to.equal(1)
    })

    it('does not write or delete a slug for an already retired non-body row', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      const plugin = await Models.Plugin.create({
        id: 'retired-safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.uninstalled,
        isProcess: false,
        isBody: false,
        conditionAddress: null,
        conditionInterfaceType: null,
        uninstalled: { status: true, transactionHash: '0xoldtx', blockNumber: 9 },
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Revoked, 10)
      const update = sandbox.spy(DbOperations, 'updateDocument')
      const deleteSlug = sandbox.spy(PluginSlug, 'deleteSlug')
      sandbox.stub(BaseGovernance, 'requestDaoMetrics').resolves()
      const info = {
        address: daoAddress,
        network,
        transactionHash: '0x0123',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 11,
      } as any

      const result = await SafeProcessModule.uninstall(plugin, info)

      expect(result?.id).to.equal(plugin.id)
      expect(update.notCalled).to.be.true
      expect(deleteSlug.notCalled).to.be.true
      expect(await Models.Plugin.findOne({ id: plugin.id }).lean()).to.include({
        status: IPluginStatus.uninstalled,
        isBody: false,
        isProcess: false,
        conditionAddress: null,
        conditionInterfaceType: null,
      })
    })
  })
})
