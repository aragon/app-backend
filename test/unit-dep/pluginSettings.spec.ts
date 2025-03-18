import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IEventLogPluginSettings, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { Multisig } from '@artifacts/Multisig'

describe('Integ: PluginSettings', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should test plugin settings', async function () {
    this.timeout(1600000) // Increase timeout for the test
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x59f1Cb40461387B6d4cad4F6fcF7505A1546ee21'
    const pluginAddress = '0x443B18A698C87c4e12abbC42086c7dc6f53a1f31'

    await Models.Plugin.create({
      id: 'ethereum-sepolia-0x2c884b15e057fbf5318caf21b008e06154ecd80ab20537bc17296ddf29cf456f-0x443B18A698C87c4e12abbC42086c7dc6f53a1f31',
      transactionHash: '0x2c884b15e057fbf5318caf21b008e06154ecd80ab20537bc17296ddf29cf456f',
      blockNumber: 7887869,
      blockTimestamp: 1741794012,
      network,
      address: pluginAddress,
      implementationAddress: '0xAf09e5F084aD19Ed3FC7FBAA2905573c69677A3d',
      interfaceType: 'multisig',
      status: 'installed',
      isSupported: false,
      daoAddress,
      tokenAddress: null,
      pluginSetupRepoAddress: '0xA0901B5BC6e04F14a9D0d094653E047644586DdE',
      sender: '0x59f1Cb40461387B6d4cad4F6fcF7505A1546ee21',
      release: '1',
      build: '5',
      subdomain: 'multisig',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: true,
      isSubPlugin: true,
      metadataIpfs: 'ipfs://QmeGZ8sdQETqrchKZeSbgAoRRpBCZbMmxNppBp8TqwC3Kq',
      name: 'Test',
      description: null,
      processKey: null,
      subPlugins: [],
      links: [],
      parentPlugin: '0x02C4de2B49FB4D5296722684Ddea453977bB072B',
      stageIndex: 0,
    })

    // contract deployed
    const tx1 = await UnitDepUtils.getData(
      Multisig.abi,
      IEventLogPluginSettings.MultisigSettingsUpdated,
      '0x2c884b15e057fbf5318caf21b008e06154ecd80ab20537bc17296ddf29cf456f',
      network,
    )

    for (const { event, logInfo } of tx1) {
      await PluginSettingHandler.multisigSettingsUpdated(event, logInfo)
    }

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    const settings = await Models.Setting.findOne({ pluginAddress, network })
    expect(plugin.isSupported).to.be.true
    expect(settings.minApprovals).to.eq(1)
    expect(settings.onlyListed).to.be.true
  })
})
