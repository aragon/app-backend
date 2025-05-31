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
import ProxyWeb3Provider from '@modules/proxyProvider'

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

    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(null as any)

    const daoInstallTx = '0x4de18d018e2cde6d7756d8f2ad3a6cf8976472a934b0d57e5f84bbd52f3f9572'
    const preparTxLog = '0x4b36461e62496220166b3e5f5611fe1fae8ad58f4d5b4660fb4566b1456adeb2'
    const appliedTxLog = '0xf68a313988c1d668c6110ef1e94abb9bc20b6a8c037f34a764c653f1fb3dc490'

    const daoAddress = '0x80879A475DA7928601884838d30f8864241630A3'
    const pluginAddressTokenVoting = '0x1F5691B2bd6FA279099d5953dd83160e58294334'
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

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('ttv')

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

    // TODO: test locks
    // add deposit transaction to VotingEscrow 0xe398B1b8863345Ce681E0f9246EeF168b538C8f6
    // const result = await Models.Lock.findWithPagination({
    //   extraParams: {
    //     pluginAddress: pluginAddressTokenVoting,
    //     memberAddress,
    //     onlyActive: true,
    //   },
    //   paginationParams: {
    //     pageSize: 10,
    //     page: 1,
    //     order: 'desc',
    //     sort: 'blockNumber',
    //   },
    // })
  })
})
