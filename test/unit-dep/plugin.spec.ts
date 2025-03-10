import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
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

  it('should handle DelegateVotesChanged event', async function () {
    this.timeout(10000000)
    const daoCreationTxHash = '0x2a47f99a78b147abb325eb14060b0ed4ba665d6a9d40d7c1a7d145e62c2f755f'
    const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(logger, 'verbose')
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
