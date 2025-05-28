import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { DAORegistry } from '@artifacts/daoRegistry'
import BlockScoutHelper from '@helpers/blockScout'
import { RateModule } from '@modules/rates'
import { IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'

describe('Integration: SPP Dao Installation  ', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })
  afterEach(() => {
    sandbox && sandbox.restore()
  })

  before(async () => {
    await UnitDepUtils.registerPluginRepos()
  })

  it('should install dao with spp and sub plugins zksync-sepolia', async function () {
    this.timeout(10000000)

    sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves({
      address: '0x00',
      decimals: 18,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      priceUsd: '1000',
      type: ITokenType.ERC20,
      logo: 'https://example.com/logo.png',
      lastUpdatedAt: new Date(),
    })

    sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
      holders: 1,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      totalSupply: '1000000000000000000',
      type: ITokenType.ERC20,
      decimals: 18,
    } as any)

    const daoInstallTx = '0xa0a797ff754fc57a2386b44dbc208592a5e55506b043d4fbde93009140235fae'
    const preparTxLog = '0xa9c543371b31cafaf31b7ccb945947f5ec1c1d193b761abfa956f32faa757b31'
    const appliedTxLog = '0xb809565937d88ca0d1d2154cd974483ef7a79620d16e2dea8ec86259ca2efccd'

    const daoAddress = '0x986020B91badBc2b8a6615B020ef4f04685159C2'
    const pluginAddressAdmin = '0x2bC7fD21328939d050364e27D91f4068c1302089'
    const pluginAddressSPP = '0xF19d074435b4Ef57991dc3107A2e8CD41929Bb3A'
    const pluginAddressMultisig = '0x286914508450501FCf7CAB3a9708b65195c37cFe'
    const pluginAddressTokenVoting = '0x25Cf379C804d5e1A7a2D9862cd73cEcC193990FF'
    const network = NetworksEnum.zksyncSepolia

    const daoRegisteredEvents = await UnitDepUtils.getData(DAORegistry.abi, 'DAORegistered', daoInstallTx, network)

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    expect(dao.address).to.eq(daoAddress)

    const txReceipts = await Web3Helper.getTransactionReceipt(daoInstallTx, network)
    expect(txReceipts).to.be.not.null
    const logs = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, network)

    for (const ev of logs) {
      await ev.handler(ev.event, ev.info)
    }

    const adminPlugin = await Models.Plugin.findByAddress(pluginAddressAdmin, network)
    expect(adminPlugin.address).to.eq(pluginAddressAdmin)
    expect(adminPlugin.status).to.eq(IPluginStatus.installed)
    expect(adminPlugin.isSupported).to.be.true
    expect(adminPlugin.name).to.be.null
    expect(adminPlugin.processKey).to.be.null
    expect(adminPlugin.isSubPlugin).to.be.false
    expect(adminPlugin.isBody).to.be.true
    expect(adminPlugin.isProcess).to.be.true
    expect(adminPlugin.uninstalled.status).to.be.false

    const pluginInstallationLogs: any = []
    for (const tx of [preparTxLog, appliedTxLog]) {
      const prepareLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationPrepared', tx, network)

      const appliedLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationApplied', tx, network)

      pluginInstallationLogs.push(...prepareLogs, ...appliedLogs)
    }

    const sortedLogs = pluginInstallationLogs.sort((a: any, b: any) => a.logInfo.logIndex - b.logInfo.logIndex)

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationPrepared')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationPrepared(log.event, log.logInfo)
        }),
    )

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationApplied')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationApplied(log.event, log.logInfo)
        }),
    )

    const plugins = await Models.Plugin.find({ daoAddress, network })
    expect(plugins.length).to.eq(4)

    const sppPlugin = plugins.find(w => w.address === pluginAddressSPP)
    expect(sppPlugin.interfaceType).to.eq(IPluginInterfaceType.spp)
    expect(sppPlugin.status).to.eq(IPluginStatus.installed)
    expect(sppPlugin.isSupported).to.be.true
    expect(sppPlugin.name).to.eq('Test process')
    expect(sppPlugin.processKey).to.eq('TP')
    expect(sppPlugin.isSubPlugin).to.be.false
    expect(sppPlugin.isBody).to.be.false
    expect(sppPlugin.isProcess).to.be.true
    expect(sppPlugin.uninstalled.status).to.be.false

    const tokenPlugin = plugins.find(w => w.address === pluginAddressTokenVoting)
    expect(tokenPlugin.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
    expect(tokenPlugin.status).to.eq(IPluginStatus.installed)
    expect(tokenPlugin.isSupported).to.be.true
    expect(tokenPlugin.name).to.eq('asdf')
    expect(tokenPlugin.processKey).to.be.null
    expect(tokenPlugin.isSubPlugin).to.be.true
    expect(tokenPlugin.isBody).to.be.true
    expect(tokenPlugin.isProcess).to.be.true
    expect(tokenPlugin.stageIndex).to.eq(0)
    expect(tokenPlugin.parentPlugin).to.eq(pluginAddressSPP)
    expect(tokenPlugin.uninstalled.status).to.be.false

    const multisigPlugin = plugins.find(w => w.address === pluginAddressMultisig)
    expect(multisigPlugin.interfaceType).to.eq(IPluginInterfaceType.multisig)
    expect(multisigPlugin.status).to.eq(IPluginStatus.installed)
    expect(multisigPlugin.isSupported).to.be.true
    expect(multisigPlugin.name).to.eq('gfh')
    expect(multisigPlugin.processKey).to.be.null
    expect(multisigPlugin.isSubPlugin).to.be.true
    expect(multisigPlugin.isBody).to.be.true
    expect(multisigPlugin.isProcess).to.be.true
    expect(multisigPlugin.stageIndex).to.eq(1)
    expect(multisigPlugin.parentPlugin).to.eq(pluginAddressSPP)
    expect(multisigPlugin.uninstalled.status).to.be.false

    const sppSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressSPP, network })
    expect(sppSlug.slug).to.eq(sppPlugin.processKey.toLowerCase())

    const multisigSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressMultisig, network })
    expect(multisigSlug.slug).to.eq('multisig')

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('tokenvoting')
  })

  it('should install dao with spp and sub plugins', async function () {
    this.timeout(10000000)

    sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves({
      address: '0x00',
      decimals: 18,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      priceUsd: '1000',
      type: ITokenType.ERC20,
      logo: 'https://example.com/logo.png',
      lastUpdatedAt: new Date(),
    })

    sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
      holders: 1,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      totalSupply: '1000000000000000000',
      type: ITokenType.ERC20,
      decimals: 18,
    } as any)

    const daoInstallTx = '0x4240289922c9d81f477227a71d9bc700dab27ca119ae62fdbb3fbac48dac124a'
    const preparTxLog = '0x8e7234ddba873c03486135d5eb0e3c66158df726ada8971a6a21299cbcde7571'
    const appliedTxLog = '0x684c6aabcd4fa7050b3c95763ef685ad6849a1ac8dace2105c1536388ad6a8a2'

    const daoAddress = '0x1D8694F500927d6cC971D1D52AdfD3b5cd17C5ff'
    const pluginAddressAdmin = '0x87047224c802416b60462DE0bBf88381bb854Cb8'
    const pluginAddressSPP = '0xC06afD0Ba2bf7c65404506565BD2099526cD2159'
    const pluginAddressMultisig = '0xfF449224b3ba6BFc2036fC2a496E3e61fc2eB6E8'
    const pluginAddressTokenVoting = '0x49839b948178C0f9D7884C92EfA14074C0b08f05'
    const network = NetworksEnum.ethereumSepolia

    const daoRegisteredEvents = await UnitDepUtils.getData(DAORegistry.abi, 'DAORegistered', daoInstallTx, network)

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    expect(dao.address).to.eq(daoAddress)

    const txReceipts = await Web3Helper.getTransactionReceipt(daoInstallTx, network)
    expect(txReceipts).to.be.not.null
    const logs = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, network)

    for (const ev of logs) {
      await ev.handler(ev.event, ev.info)
    }

    const adminPlugin = await Models.Plugin.findByAddress(pluginAddressAdmin, network)
    expect(adminPlugin.address).to.eq(pluginAddressAdmin)
    expect(adminPlugin.status).to.eq(IPluginStatus.installed)
    expect(adminPlugin.isSupported).to.be.true
    expect(adminPlugin.name).to.be.null
    expect(adminPlugin.processKey).to.be.null
    expect(adminPlugin.isSubPlugin).to.be.false
    expect(adminPlugin.isBody).to.be.true
    expect(adminPlugin.isProcess).to.be.true
    expect(adminPlugin.uninstalled.status).to.be.false

    const pluginInstallationLogs: any = []
    for (const tx of [preparTxLog, appliedTxLog]) {
      const prepareLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationPrepared', tx, network)

      const appliedLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationApplied', tx, network)

      pluginInstallationLogs.push(...prepareLogs, ...appliedLogs)
    }

    const sortedLogs = pluginInstallationLogs.sort((a: any, b: any) => a.logInfo.logIndex - b.logInfo.logIndex)

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationPrepared')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationPrepared(log.event, log.logInfo)
        }),
    )

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationApplied')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationApplied(log.event, log.logInfo)
        }),
    )

    const plugins = await Models.Plugin.find({ daoAddress, network })
    expect(plugins.length).to.eq(4)

    const sppPlugin = plugins.find(w => w.address === pluginAddressSPP)
    expect(sppPlugin.interfaceType).to.eq(IPluginInterfaceType.spp)
    expect(sppPlugin.status).to.eq(IPluginStatus.installed)
    expect(sppPlugin.isSupported).to.be.true
    expect(sppPlugin.name).to.eq('The Process')
    expect(sppPlugin.processKey).to.eq('PROC')
    expect(sppPlugin.isSubPlugin).to.be.false
    expect(sppPlugin.isBody).to.be.false
    expect(sppPlugin.isProcess).to.be.true
    expect(sppPlugin.uninstalled.status).to.be.false

    const tokenPlugin = plugins.find(w => w.address === pluginAddressTokenVoting)
    expect(tokenPlugin.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
    expect(tokenPlugin.status).to.eq(IPluginStatus.installed)
    expect(tokenPlugin.isSupported).to.be.true
    expect(tokenPlugin.name).to.eq('Body 1')
    expect(tokenPlugin.processKey).to.be.null
    expect(tokenPlugin.isSubPlugin).to.be.true
    expect(tokenPlugin.isBody).to.be.true
    expect(tokenPlugin.isProcess).to.be.true
    expect(tokenPlugin.stageIndex).to.eq(0)
    expect(tokenPlugin.parentPlugin).to.eq(pluginAddressSPP)
    expect(tokenPlugin.uninstalled.status).to.be.false

    const multisigPlugin = plugins.find(w => w.address === pluginAddressMultisig)
    expect(multisigPlugin.interfaceType).to.eq(IPluginInterfaceType.multisig)
    expect(multisigPlugin.status).to.eq(IPluginStatus.installed)
    expect(multisigPlugin.isSupported).to.be.true
    expect(multisigPlugin.name).to.eq('Body 2')
    expect(multisigPlugin.processKey).to.be.null
    expect(multisigPlugin.isSubPlugin).to.be.true
    expect(multisigPlugin.isBody).to.be.true
    expect(multisigPlugin.isProcess).to.be.true
    expect(multisigPlugin.stageIndex).to.eq(1)
    expect(multisigPlugin.parentPlugin).to.eq(pluginAddressSPP)
    expect(multisigPlugin.uninstalled.status).to.be.false

    const sppSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressSPP, network })
    expect(sppSlug.slug).to.eq(sppPlugin.processKey.toLowerCase())

    const multisigSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressMultisig, network })
    expect(multisigSlug.slug).to.eq('multisig')

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('tokenvoting')
  })

  it.skip('should install dao and update plugin', async function () {
    this.timeout(10000000)

    sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves({
      address: '0x00',
      decimals: 18,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      priceUsd: '1000',
      type: ITokenType.ERC20,
      logo: 'https://example.com/logo.png',
      lastUpdatedAt: new Date(),
    })

    sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
      holders: 1,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      totalSupply: '1000000000000000000',
      type: ITokenType.ERC20,
      decimals: 18,
    } as any)

    const daoInstallTx = '0x3770cefd724faec40d6a386ed2aad54f979b7512c786cdf14a11901e4e79ecb7'
    const inPreparTxLog = '0xce9858662de955d2f65e27cd812670aac0ec70bc10b8d5d91c18cb508c83fa67'
    const inAppliedTxLog = '0x9d5b9253e1477765ab738631a069b03fabb942239af1b25c695a95844cb00679'
    const upPreparTxLog = '0xee44d0e4d569bfbd82d9060252e183e946f73c2e1a9508e1fc72a49d24df7120'
    const upAppliedTxLog = '0x9610f2a4a9376bd618b610232c3e20923bd47f859d96c090b063fd0da75a48e5'

    const daoAddress = '0x6d4FB6Ff01A172774f42789fcfcdd84E68c28494'
    const pluginAddress = '0x5dB93850d843aF581d8b87C350Aa849a13a88e40'
    const network = NetworksEnum.polygonMainnet

    const daoRegisteredEvents = await UnitDepUtils.getData(DAORegistry.abi, 'DAORegistered', daoInstallTx, network)

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    expect(dao.address).to.eq(daoAddress)

    const pluginInstallationLogs: any = []
    for (const tx of [inPreparTxLog, inAppliedTxLog, upPreparTxLog, upAppliedTxLog]) {
      const inPrepareLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationPrepared', tx, network)
      const inAppliedLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'InstallationApplied', tx, network)
      const upPrepareLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'UpdatePrepared', tx, network)
      const upAppliedLogs = await UnitDepUtils.getData(PluginSetupProcessor.abi, 'UpdateApplied', tx, network)

      pluginInstallationLogs.push(...inPrepareLogs, ...inAppliedLogs, ...upPrepareLogs, ...upAppliedLogs)
    }

    const sortedLogs = pluginInstallationLogs.sort((a: any, b: any) => a.logInfo.logIndex - b.logInfo.logIndex)

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationPrepared')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationPrepared(log.event, log.logInfo)
        }),
    )

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'InstallationApplied')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.installationApplied(log.event, log.logInfo)
        }),
    )

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'UpdatePrepared')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.updatePrepared(log.event, log.logInfo)
        }),
    )

    await Promise.all(
      sortedLogs
        .filter((log: any) => log.event.name === 'UpdateApplied')
        .map(async (log: any) => {
          await PluginSetupProcessorHandler.updateApplied(log.event, log.logInfo)
        }),
    )

    const plugins = await Models.Plugin.find({ daoAddress, network })
    expect(plugins.length).to.eq(2)
    const updatedPlugin = plugins.find((p: any) => p.status === IPluginStatus.installed)
    expect(updatedPlugin.isSupported).to.be.true

    const slug = await Models.PluginSlug.findOne({ pluginAddress, daoAddress, network })
    expect(slug.slug).to.eq('multisig')
  })
})
