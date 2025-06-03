import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { DAORegistry } from '@artifacts/daoRegistry'
import { IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'

describe('Integration: VeGovernance', () => {
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

  it('should install veGovernace dao on ethereum-sepolia', async function () {
    this.timeout(1000000000)

    const daoInstallTx = '0x0b1e795a21d8321af74a9751bf2cb74ec7650ca9c244b8a1a4e014acefdb3030'
    const preparTxLog = '0x2e3f7c686742c3537f6610fe65733e0705944e289c8ee4251bdf280ce99a34ba'
    const appliedTxLog = '0x3cfdf0be3a9c6118fb90893b424de0b2d4c3698fec5695b3977c65d2ec2e1eb6'

    const daoAddress = '0x28d1383Eca8Ad310f2a9943F9A2D6B970a918659'
    const pluginAddressTokenVoting = '0x521D938b949c8bFD0BB1374D247757cc86364Fb5'
    const tokenAddress = '0x173016A1f1625663D812DB98738A58D52ac6fCF6'
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
    expect(plugins.length).to.eq(2)

    const tokenPlugin = plugins.find(w => w.address === pluginAddressTokenVoting)
    expect(tokenPlugin.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
    expect(tokenPlugin.status).to.eq(IPluginStatus.installed)
    expect(tokenPlugin.isSupported).to.be.true
    expect(tokenPlugin.votingEscrow.curveAddress).to.eq('0xA12D04De2Cc8FCCA2f2fD019a2851571b579767d')
    expect(tokenPlugin.votingEscrow.exitQueueAddress).to.eq('0x9c1d97357B2E5Cf8428E7B7Df314b79Fd8dD7282')
    expect(tokenPlugin.votingEscrow.escrowAddress).to.eq('0xe398B1b8863345Ce681E0f9246EeF168b538C8f6')
    expect(tokenPlugin.votingEscrow.clockAddress).to.eq('0x81Bd8F94F258eFf9Abe045c57C750440A088049e')
    expect(tokenPlugin.votingEscrow.nftLockAddress).to.eq('0xAd5B5340bb1f61870Ec3956DE26A8B6BD3e1b931')
    expect(tokenPlugin.votingEscrow.underlying).to.eq('0xEDc278C1DFAD001e875bb75064fC68099Ab65f88')

    const token = await Models.Token.findOne({ address: tokenPlugin.tokenAddress, network })
    expect(token.type).to.eq(ITokenType.escrowAdapter)
    expect(token.isGovernance).to.be.true
    expect(token.address).to.eq(tokenAddress)
    expect(token.underlying).to.eq('0xEDc278C1DFAD001e875bb75064fC68099Ab65f88')

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.exist

    const activeSettings = await Models.Setting.findActive({
      daoAddress,
      pluginAddress: pluginAddressTokenVoting,
      network,
    })
    expect(activeSettings.votingEscrow.minDeposit).to.eq('100000000000000000000')
    expect(activeSettings.votingEscrow.minLockTime).to.eq(864000)
    expect(activeSettings.votingEscrow.maxTime).to.eq(0)
    expect(activeSettings.votingEscrow.slope).to.eq(0)
    expect(activeSettings.votingEscrow.cooldown).to.eq(259200)
  })
})
