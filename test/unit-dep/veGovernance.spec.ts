import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { DAORegistry } from '@artifacts/daoRegistry'
import {IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum} from '@types'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import ProxyWeb3Provider from "@modules/proxyProvider";

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
    this.timeout(10000000)

    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(null as any)

    const daoInstallTx = '0x87a6fb27a21b7e9bb9939538f833f7e8b16d4aa25843d82a1e0a6f32b39cdb85'
    const preparTxLog = '0xf01734063133bbd90e90ce1d4ddc7b3225ec7a967b2368ff5053a7a8316a5bf1'
    const appliedTxLog = '0x3eb83755de968d65c02587e0f4b49d1443e17a03ed39441f9bb3d64e4f04ea05'

    const daoAddress = '0x5810b858A6d6b4F5F570932FD31F2eA087f29109'
    const pluginAddressTokenVoting = '0x2455D92D9f773E8bb9e6bcaD66D96De5222F9E6F'
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

    const token = await Models.Token.findOne({ address: tokenPlugin.tokenAddress, network })
    expect(token.type).to.eq(ITokenType.escrowAdapter)
    expect(token.isGovernance).to.be.true

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('lock')

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
