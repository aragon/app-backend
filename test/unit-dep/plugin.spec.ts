import { DAORegistry } from '@artifacts/daoRegistry'
import { Multisig } from '@artifacts/Multisig'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { Models } from '@dbModels'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import BlockScoutHelper from '@helpers/blockScout'
import CoinGeckoHelper from '@helpers/coinGecko'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import { LibUtils } from '@test/lib/unit-dep/lib'
import Plugins from '@test/unit-dep/mockData/sppPairMockPlugin.json'
import {
  IEventLogPluginSettings,
  IEventLogPluginType,
  IPluginInterfaceType,
  IPluginStatus,
  ITokenType,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: Plugin', () => {
  let sandbox: SinonSandbox
  let rabbitMqStub: any

  before(async () => {
    await LibUtils.registerPluginRepos(NetworksEnum.ethereumSepolia)
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.skip('should handle multisig plugin different abi', async function () {
    this.timeout(10000000)

    const daoAddress = '0x56F406551b725072853317A11fc4EAF24B05037E'
    const pluginAddress = '0x957f7145BA7B633165519C2f313a05E359cDc2E4'

    const daoCreationTxHash = '0x69f1c90f66b5af323ae093bade7134f502bef5c10e313ceee4e694998a9815a3'
    const daoRegisteredEvents = await LibUtils.getData(
      DAORegistry.abi,
      'DAORegistered',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const dao = await Models.Dao.findOne({ address: daoAddress })
    expect(dao?.address).to.eq(daoAddress)

    const multisigPluginPreparedEvents = await LibUtils.getData(
      PluginSetupProcessor.abi,
      IEventLogPluginType.InstallationPrepared,
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of multisigPluginPreparedEvents) {
      await PluginSetupProcessorHandler.installationPrepared(event, logInfo)
    }

    const multisigPluginAppliedEvents = await LibUtils.getData(
      PluginSetupProcessor.abi,
      IEventLogPluginType.InstallationApplied,
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of multisigPluginAppliedEvents) {
      await PluginSetupProcessorHandler.installationApplied(event, logInfo)
    }

    const plugin = await Models.Plugin.findOne({ address: pluginAddress })
    expect(plugin?.address).to.eq(pluginAddress)
    expect(plugin?.isSupported).to.be.true
  })

  it('should test pairing SPP plugins', async () => {
    const txHash = '0x05bf306dadf218eb8d83a081b544031d9ce1c76de3701568afbf015e960d9a6b'
    const network = NetworksEnum.cornMainnet

    const plugins = Plugins.map(plugin => {
      return {
        ...plugin,
        _id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        __v: undefined,
      }
    })

    await Promise.all(plugins.map(async p => await Models.Plugin.create(p)))

    await Models.Dao.create({
      id: 'corn-mainnet-0xBe31BC9278e4745d9D04F4A9113B71Db3Bdc7E43',
      isActive: true,
      isHidden: false,
      network: 'corn-mainnet',
      transactionHash: '0x95c832ae5a148570f57e27cf600cc0fed999c1232fadc4aa8edfe5a515a949f3',
      blockNumber: 640435,
      blockTimestamp: 1750254946,
      address: '0xBe31BC9278e4745d9D04F4A9113B71Db3Bdc7E43',
      implementationAddress: '0x604953e159562FeEfF38961541415B0C0694Ef5A',
      creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      ens: null,
      subdomain: null,
      metadataIpfs: 'ipfs://QmcUGDfvKPgZugPrRPttWUx6rUJxNRdtZsP9MVStZ7JMcu',
      name: '2025-06-18 Corn',
      description: 'asdfasdf',
      avatar: 'ipfs://QmX4q3fu1QkSfdVFUAmSUWziCmnXtitp2TVKLbrFVBcPvv',
      version: '1.4.0',
      metrics: {
        tvlUSD: 0,
        proposalsCreated: 2,
        proposalsExecuted: 1,
        uniqueVoters: 0,
        votes: 0,
        members: 1,
      },
      links: [],
    })

    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)
    const parsedLogs = await LibUtils.parseLogsByConfig(receipt!.logs as any, network)

    for (const log of parsedLogs) {
      await log.handler(log.event, log.info)
    }

    const subProposals = await Models.Proposal.find({
      isSubProposal: true,
    })

    expect(subProposals.length).to.be.eq(10)

    subProposals.forEach((subProposal: any) => {
      expect(subProposal.parentProposal).to.be.not.null
      expect(subProposal.parentProposal.pluginAddress).to.be.eq('0x9F674BC5a486c14e9deb8D27557300a9c0e3CBb7')
    })

    const mainProposal = await Models.Proposal.findOne({
      isSubProposal: false,
    })

    expect(mainProposal.subProposals.length).to.be.eq(10)
  })

  it('should handle plugin installation token voting', async function () {
    this.timeout(10000000)
    const daoCreationTxHash = '0x2a47f99a78b147abb325eb14060b0ed4ba665d6a9d40d7c1a7d145e62c2f755f'
    sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
      address: '0x00',
      decimals: 18,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      priceUsd: '1000',
      type: ITokenType.ERC20,
      logo: 'https://example.com/logo.png',
      lastUpdatedAt: new Date(),
    } as any)

    sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
      holders: 1,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      totalSupply: '1000000000000000000',
      type: ITokenType.ERC20,
      decimals: 18,
    } as any)

    const daoRegisteredEvents = await LibUtils.getData(
      DAORegistry.abi,
      'DAORegistered',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const adminPluginPreparedEvents = await LibUtils.getData(
      PluginSetupProcessor.abi,
      'InstallationPrepared',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of adminPluginPreparedEvents) {
      await PluginSetupProcessorHandler.installationPrepared(event, logInfo)
    }

    const adminPluginAppliedEvents = await LibUtils.getData(
      PluginSetupProcessor.abi,
      'InstallationApplied',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of adminPluginAppliedEvents) {
      await PluginSetupProcessorHandler.installationApplied(event, logInfo)
    }

    const adminPlugin = await Models.Plugin.findOne({ interfaceType: IPluginInterfaceType.admin })
    expect(adminPlugin).to.not.be.null

    /**
     * Look for admin plugin transaction hash and install other plugins
     */

    const adminPluginTxHash = await BlockScoutHelper.getTransactionOfAnAddress(
      adminPlugin!.address,
      NetworksEnum.ethereumSepolia,
    )
    expect(adminPluginTxHash).to.not.be.null

    // BlockScout not always returns a response
    if (!Array.isArray(adminPluginTxHash) || adminPluginTxHash.length === 0) {
      return
    }

    rabbitMqStub.callsFake(async (queue: string, message: any) => {
      if (queue === 'log.plugins') {
        const plugin = await Models.Plugin.findOne({ address: message.params.address })
        console.log(`Plugin Syncing ${plugin!.interfaceType}, ${plugin!.address}`)
      }
    })

    const adminPluginInstallationLogs: any = []
    let pluginCount = 1 //admin plugin counts as 1

    for (const { txHash } of adminPluginTxHash.reverse()) {
      const prepareLogs = await LibUtils.getData(
        PluginSetupProcessor.abi,
        'InstallationPrepared',
        txHash,
        NetworksEnum.ethereumSepolia,
      )

      const appliedLogs = await LibUtils.getData(
        PluginSetupProcessor.abi,
        'InstallationApplied',
        txHash,
        NetworksEnum.ethereumSepolia,
      )

      adminPluginInstallationLogs.push(...prepareLogs, ...appliedLogs)

      pluginCount += prepareLogs.length
    }

    const sortedLogs = adminPluginInstallationLogs.sort(
      (a: any, b: any) => a.logInfo.blockNumber - b.logInfo.blockNumber,
    )

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

    const plugins = await Models.Plugin.find({})
    expect(plugins).to.have.length(pluginCount)

    await Promise.all(
      plugins.map(async (plugin: any) => {
        if (plugin.interfaceType === IPluginInterfaceType.admin) {
          return
        }
        const activeSetting = await Models.Setting.findActive({
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: plugin.network,
        })
        expect(activeSetting).to.not.be.null
      }),
    )
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
    const tx1 = await LibUtils.getData(
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

  describe.skip('Installation And Uninstallation Of Plugin Via Revoke And Grant ', () => {
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
      const logsDaoInstall = await LibUtils.parseLogsByConfig(daoTxReceipts?.logs! as any, network)

      for (const ev of logsDaoInstall) {
        await ev.handler(ev.event, ev.info)
      }

      //install plugin
      const logsPrepare = await LibUtils.parseLogsByConfig(pluginInstallationTxReceiptPrepare?.logs! as any, network)
      for (const ev of logsPrepare) {
        await ev.handler(ev.event, ev.info)
      }

      //install plugin applied
      const logsApplied = await LibUtils.parseLogsByConfig(pluginInstallationTxReceiptApplied?.logs! as any, network)
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

      const logsRevokeAndGrant = await LibUtils.parseLogsByConfig(revokeTxReceipt.logs as any, network)
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
})
