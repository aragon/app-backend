import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import Web3Helper from '@helpers/web3'
import { IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe.skip('Installation And Uninstallation Of Plugin Via Revoke And Grant ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should install properly plugins and dao', async function () {
    this.timeout(100000)
    const daoAddress = '0x0AB0902f1d4AF089Af6dcDD512E9BFe40b20f679'
    const network = NetworksEnum.ethereumSepolia
    sandbox.restore()
    UnitDepUtils.stubRabbitmqSend(sandbox)

    await UnitDepUtils.syncACompleteDao(daoAddress, network)
  })

  it('should revoke and grant permission to plugin', async function () {
    this.timeout(1000000)
    const revokeTxHash = '0x9ef64afa23ef2ced4dbfec481c31dd7a17441fc6b6c586d14104a10e59342966'

    const network = NetworksEnum.ethereumSepolia
    const createDaoTxHash = '0x5a059dc68ba109df5c3cc255380da4ad9d4d09f508093fff2196580bca50ebbb'
    const pluginInstallationTxHashPrepare = '0xbf9e3ac7a9aff1248ac333b18035eed748e19f5a8ed86ca5587429cdb545d8d4'
    const pluginInstallationAppliedTxHash = '0x535989b131da3871381a4c4e80a2155f54e05b6b89daf668f6b9d7d031d8e528'

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

    let plugin = await Models.Plugin.findByAddress(logsRevoked.event.args.who, network)

    for (let i = 0; i < logsRevokeAndGrant.length; i++) {
      const ev = logsRevokeAndGrant[i]
      await ev.handler(ev.event, ev.info)
      if (i === 0) {
        plugin = await plugin.reload()
        expect(plugin.status).to.be.eq(IPluginStatus.uninstalled)
      }

      if (i === 1) {
        plugin = await plugin.reload()
        expect(plugin.status).to.be.eq(IPluginStatus.installed)
      }
    }

    expect(plugin.status).to.be.eq(IPluginStatus.installed)

    //re-handle the logs to ensure everything is processed correctly
    for (const ev of logsRevokeAndGrant) {
      await ev.handler(ev.event, ev.info)
    }

    plugin = await plugin.reload()
    expect(plugin.status).to.be.eq(IPluginStatus.installed)
  })
})
