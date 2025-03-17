import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IEventLogPluginType, IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { RateModule } from '@modules/rates'
import logger from '@logger'
import { PluginSlug } from '@helpers/pluginSlug'

describe('Integration: Plugin Setup SPP', () => {
  let sandbox: SinonSandbox

  before(async () => {
    await UnitDepUtils.registerPluginRepos()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('plugin slug', async function () {
    this.timeout(10000000)

    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x9b42704949b98CE4C3b7484D3Fe2694807768942'
    const pluginAddress = '0x0b001495e87237c2Cd57F2E7CEE5962016BC5ca2'

    const plugin = await Models.Plugin.create({
      id: 'ethereum-sepolia-0x83a5a6df11c205990c24dc10ddb14af669578b9207511bac2a881a0ce84bb5d0-0x0b001495e87237c2Cd57F2E7CEE5962016BC5ca2',
      transactionHash: '0x83a5a6df11c205990c24dc10ddb14af669578b9207511bac2a881a0ce84bb5d0',
      blockNumber: 7686518,
      blockTimestamp: 1739284548,
      network,
      address: pluginAddress,
      implementationAddress: '0x4cCA57aC117Ae35bd0222f8dE52fc4f9c88eBa6f',
      interfaceType: 'spp',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress: null,
      pluginSetupRepoAddress: '0xE67b8E026d190876704292442A38163Ce6945d6b',
      sender: '0x9b42704949b98CE4C3b7484D3Fe2694807768942',
      release: '1',
      build: '8',
      subdomain: 'spp',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: false,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://Qmc8ECxCFCZS7R5ruavYfiCUfRoXQ1gi1GKWDWZBifVSxZ',
      name: 'End To End',
      description: null,
      processKey: 'ETE',
      subPlugins: [
        {
          addresses: ['0xd7750B1B69aBD00bc1D02adEd842Ec65AfBe52a5'],
          stageIndex: 0,
        },
      ],
      links: [],
      totalStages: 1,
    })

    await PluginSlug.generateSlug(plugin, plugin?.processKey)

    console.log('ok')
  })

  it('should handle multisig plugin different abi', async function () {
    this.timeout(10000000)

    const daoAddress = '0x56F406551b725072853317A11fc4EAF24B05037E'
    const pluginAddress = '0x957f7145BA7B633165519C2f313a05E359cDc2E4'

    const daoCreationTxHash = '0x69f1c90f66b5af323ae093bade7134f502bef5c10e313ceee4e694998a9815a3'
    const daoRegisteredEvents = await UnitDepUtils.getData(
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

    const multisigPluginPreparedEvents = await UnitDepUtils.getData(
      PluginSetupProcessor.abi,
      IEventLogPluginType.InstallationPrepared,
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of multisigPluginPreparedEvents) {
      await PluginSetupProcessorHandler.installationPrepared(event, logInfo)
    }

    const multisigPluginAppliedEvents = await UnitDepUtils.getData(
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

    console.log('ok')
  })

  it('should handle plugin installation token voting', async function () {
    this.timeout(10000000)
    const daoCreationTxHash = '0x2a47f99a78b147abb325eb14060b0ed4ba665d6a9d40d7c1a7d145e62c2f755f'
    const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves({
      address: '0x00',
      decimals: 18,
      name: 'Wrapped Ether',
      symbol: 'WETH',
      priceUsd: '1000',
      priceChangeOnDayUsd: '0',
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

    const daoRegisteredEvents = await UnitDepUtils.getData(
      DAORegistry.abi,
      'DAORegistered',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const adminPluginPreparedEvents = await UnitDepUtils.getData(
      PluginSetupProcessor.abi,
      'InstallationPrepared',
      daoCreationTxHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of adminPluginPreparedEvents) {
      await PluginSetupProcessorHandler.installationPrepared(event, logInfo)
    }

    const adminPluginAppliedEvents = await UnitDepUtils.getData(
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

    rabbitMqStub.callsFake(async (queue: string, message: any) => {
      if (queue === 'log.plugins') {
        const plugin = await Models.Plugin.findOne({ address: message.params.address })
        console.log(`Plugin Syncing ${plugin!.interfaceType}, ${plugin!.address}`)
      }
    })

    const adminPluginInstallationLogs: any = []
    let pluginCount = 1 //admin plugin counts as 1

    for (const { txHash } of adminPluginTxHash.reverse()) {
      const prepareLogs = await UnitDepUtils.getData(
        PluginSetupProcessor.abi,
        'InstallationPrepared',
        txHash,
        NetworksEnum.ethereumSepolia,
      )

      const appliedLogs = await UnitDepUtils.getData(
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
})
