import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { DAORegistry } from '@artifacts/daoRegistry'
import BlockScoutHelper from '@helpers/blockScout'
import { RateModule } from '@modules/rates'
import { ITokenType, NetworksEnum } from '@types'
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
    // sandbox.stub(logger, 'verbose')
  })
  afterEach(() => {
    sandbox && sandbox.restore()
  })

  before(async () => {
    await UnitDepUtils.registerPluginRepos()
  })

  it('should install the complete dao', async function () {
    this.timeout(10000000)

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

    const daoInstallTx = '0x3af63fd42b09d03d93d6bb9e9652cf81aebabba3924c1f711d2e244f55a15742'

    const daoRegisteredEvents = await UnitDepUtils.getData(
      DAORegistry.abi,
      'DAORegistered',
      daoInstallTx,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of daoRegisteredEvents) {
      await DaoRegistryHandler.daoRegistered(event, logInfo)
    }

    const txReceipts = await Web3Helper.getTransactionReceipt(daoInstallTx, NetworksEnum.ethereumSepolia)
    expect(txReceipts).to.be.not.null

    const logs = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, NetworksEnum.ethereumSepolia)

    for (const ev of logs) {
      await ev.handler(ev.event, ev.info)
    }

    const dao = await Models.Dao.find({})
    expect(dao.length).to.be.eq(1)
    const adminPlugin = await Models.Plugin.find({})
    expect(adminPlugin.length).to.be.eq(1)

    const preparTxLog = '0x017a9d67b80a4177dff43f51ef07068974630d9f5fb7cdb5323ee9a537e4701d'
    const appliedTxLog = '0xbcb0e99fce62d0c6dfe11269fb5171186bf670f38e5fd49782fac379eda3bec0'

    const adminPluginInstallationLogs: any = []

    for (const tx of [preparTxLog, appliedTxLog]) {
      const prepareLogs = await UnitDepUtils.getData(
        PluginSetupProcessor.abi,
        'InstallationPrepared',
        tx,
        NetworksEnum.ethereumSepolia,
      )

      const appliedLogs = await UnitDepUtils.getData(
        PluginSetupProcessor.abi,
        'InstallationApplied',
        tx,
        NetworksEnum.ethereumSepolia,
      )

      adminPluginInstallationLogs.push(...prepareLogs, ...appliedLogs)
    }

    const sortedLogs = adminPluginInstallationLogs.sort((a: any, b: any) => a.logInfo.logIndex - b.logInfo.logIndex)

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

    const plugins = await Models.Plugin.find({ processKey: { $ne: null } })

    expect(plugins.length).to.be.eq(1)
    expect(plugins[0].processKey).to.be.eq('GRANT')
  })
})
