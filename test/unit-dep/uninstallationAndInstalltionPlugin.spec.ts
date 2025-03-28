import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import Web3Helper from '@helpers/web3'
import { IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Installation And Uninstallation Of Plugin Via Revoke And Grant ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should revoke and grant permission to plugin', async function () {
    this.timeout(1000000)
    const revokeTxHash = '0x8c26a5fbc7fa3364058a2a5f169ad8ab4f1640be047c74161745f6c794705012'

    const network = NetworksEnum.ethereumSepolia
    const createDaoTxHash = '0xc1add76f1348bbe6790a339013a1e7612d970abd1f6db884d99e93bf2df5a2e0'
    const pluginInstallationTxHashPrepare = '0xa050ec835a9aa1aed1ed0256e4e7b9d232f420a9911e447e35ffe05371fbee2d'
    const pluginInstallationAppliedTxHash = '0x02452fbe5d16232c97111ed97b920b37e4863d83503e571bd88ed6e3e4fa49ff'

    const daoTxReceipts = await Web3Helper.getTransactionReceipt(createDaoTxHash, network)
    const pluginInstallationTxReceiptPrepare = await Web3Helper.getTransactionReceipt(
      pluginInstallationTxHashPrepare,
      network,
    )
    const pluginInstallationTxReceiptApplied = await Web3Helper.getTransactionReceipt(
      pluginInstallationAppliedTxHash,
      network,
    )

    if (!daoTxReceipts || !pluginInstallationTxReceiptPrepare || !pluginInstallationTxReceiptApplied) {
      return
    }

    //install dao
    const logsDaoInstall = await UnitDepUtils.parseLogsByConfig(daoTxReceipts?.logs! as any, network)

    for (const ev of logsDaoInstall) {
      await ev.handler(ev.event, ev.info)
    }

    //install plugin
    const logsPrepare = await UnitDepUtils.parseLogsByConfig(pluginInstallationTxReceiptPrepare?.logs! as any, network)
    for (const ev of logsPrepare) {
      await ev.handler(ev.event, ev.info)
    }

    //install plugin applied
    const logsApplied = await UnitDepUtils.parseLogsByConfig(pluginInstallationTxReceiptApplied?.logs! as any, network)
    for (const ev of logsApplied) {
      await ev.handler(ev.event, ev.info)
    }

    const dao = await Models.Dao.find({})
    expect(dao).to.be.an('array')
    expect(dao).to.have.lengthOf(1)

    const plugins = await Models.Plugin.find({})
    expect(plugins).to.be.an('array')
    expect(plugins.length).to.be.gt(1)

    const revokeTxReceipt = await Web3Helper.getTransactionReceipt(revokeTxHash, network)
    if (!revokeTxReceipt) {
      return
    }

    //here is the revoke and grant happening

    const logsRevokeAndGrant = await UnitDepUtils.parseLogsByConfig(revokeTxReceipt.logs as any, network)
    const logsRevoked = logsRevokeAndGrant[0]
    const logsGranted = logsRevokeAndGrant[2]
    let plugin = await Models.Plugin.findByAddress(logsRevoked.event.args.who, network)
    expect(plugin.status).to.be.eq(IPluginStatus.installed)

    //uninstall first
    await logsRevoked.handler(logsRevoked.event, logsRevoked.info)
    plugin = await plugin.reload()
    expect(plugin.status).to.be.eq(IPluginStatus.uninstalled)
    expect(plugin.uninstalled.status).to.be.eq(true)
    expect(plugin.uninstalled.transactionHash).to.be.eq(revokeTxHash)
    //install again
    await logsGranted.handler(logsGranted.event, logsGranted.info)
    plugin = await plugin.reload()
    expect(plugin.status).to.be.eq(IPluginStatus.installed)
    expect(plugin.uninstalled.status).to.be.eq(false)
    expect(plugin.uninstalled.transactionHash).to.be.eq(revokeTxHash)
    //expect part
  })
})
