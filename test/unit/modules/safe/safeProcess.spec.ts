import config from '@config'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import { PluginHandler } from '@handlers/pluginHandler'
import ContractHelper from '@helpers/contractHelper'
import PluginDetector from '@helpers/pluginDetector'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeProcessModule from '@modules/safe/safeProcess'
import { EnumQueueName, IConditionInterfaceType, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: safe/safeProcess', () => {
  let sandbox: SinonSandbox
  let errorStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'warn')
    errorStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => sandbox.restore())

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

    beforeEach(() => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: daoAddress } as any)
      sandbox.stub(PluginSlug, 'generateSlug').resolves('safe')
      seedDao = sandbox.stub(SafeBodyMembersModule, 'seedDao').resolves()
      getBytecode = sandbox.stub(ContractHelper, 'getBytecode').resolves(safeProxyCode)
      readOwners = sandbox
        .stub(SafeChainReaderModule, 'readOwners')
        .resolves(['0x4444444444444444444444444444444444444444'])
      sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
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

    it('skips an address without the Safe selector', async () => {
      getBytecode.resolves('0x6080604052')

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
      expect(seedDao.notCalled).to.be.true
    })

    it('skips a contract with the Safe selector but no owners', async () => {
      readOwners.resolves(null)

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
      expect(seedDao.notCalled).to.be.true
    })

    it('leaves a row with another interface alone', async () => {
      await createRow(IPluginInterfaceType.multisig, IPluginStatus.installed)

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      const plugin = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(plugin?.interfaceType).to.equal(IPluginInterfaceType.multisig)
      expect(getBytecode.notCalled).to.be.true
    })

    it('reinstalls a Safe and clears both condition fields', async () => {
      await createRow(IPluginInterfaceType.safe, IPluginStatus.uninstalled)
      await Models.Plugin.updateOne(
        { address: safeAddress },
        {
          conditionAddress: '0x4444444444444444444444444444444444444444',
          conditionInterfaceType: IConditionInterfaceType.executeSelector,
          uninstalled: { status: true },
        },
      )

      await SafeProcessModule.install(daoAddress, safeAddress, info)

      const plugin = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(plugin).to.include({
        status: IPluginStatus.installed,
        conditionAddress: null,
        conditionInterfaceType: null,
      })
      expect(plugin?.uninstalled.status).to.be.false
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

    it('logs a failed code read and returns undefined', async () => {
      getBytecode.rejects(new Error('node down'))
      const result = await SafeProcessModule.install(daoAddress, safeAddress, info)

      expect(result).to.be.undefined
      expect(errorStub.calledOnceWith('Unable to register Safe process, rerun registerSafeProcesses' as any)).to.be.true
      expect(await Models.Plugin.countDocuments({ address: safeAddress })).to.equal(0)
    })

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
    it('uninstalls a Safe without setup checks and refreshes DAO metrics', async () => {
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
      const info = { network, transactionHash: '0x0123', blockNumber: 12345 } as any
      const receiptSpy = sandbox.spy(Web3Helper, 'getTransactionReceipt')
      const logsSpy = sandbox.spy(Web3Utils, 'findLogsByName')
      const detectorSpy = sandbox.spy(PluginDetector, 'detectPluginType')
      const deleteSlug = sandbox.stub(PluginSlug, 'deleteSlug').resolves()
      const metricsSpy = sandbox.spy(BaseGovernance, 'requestDaoMetrics')
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await SafeProcessModule.uninstall(plugin, info)

      const stored = await Models.Plugin.findOne({ address: safeAddress }).lean()
      expect(stored?.status).to.equal(IPluginStatus.uninstalled)
      expect(stored?.uninstalled).to.include({
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp: 1620000000,
      })
      expect(result?.id).to.equal(plugin.id)
      expect(deleteSlug.calledOnceWith(result)).to.be.true
      expect(receiptSpy.notCalled).to.be.true
      expect(logsSpy.notCalled).to.be.true
      expect(detectorSpy.notCalled).to.be.true
      expect(metricsSpy.calledOnceWith(daoAddress, network)).to.be.true
      expect(sendMessage.calledOnceWith(EnumQueueName.daoMetrics)).to.be.true
      expect(sendMessage.firstCall.args[1]).to.deep.equal({
        id: daoAddress,
        params: { address: daoAddress, network },
      })
    })
  })
})
