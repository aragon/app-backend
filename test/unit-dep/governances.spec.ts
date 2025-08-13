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
import ProxyWeb3Provider from '@modules/proxyProvider'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { GovernanceVeHandler } from '@handlers/governanceVeHandler'
import { ExitQueue } from '@artifacts/ExitQueue'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProposalHandler } from '@handlers/proposalHandler'

describe('Integration: Governances', () => {
  let sandbox: SinonSandbox

  before(async () => {
    await UnitDepUtils.registerPluginRepos()
  })
  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })
  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should install ERC20 governance dao on ethereum-sepolia + proposal and totalSupply', async function () {
    this.timeout(10000000)

    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(null as any)

    const daoInstallTx = '0x4aac9bd62eb5905e09a18d350ee896ec6215d3dd5216b99e787b58aac59a4777'
    const preparTxLog = '0xa6f3c83bf2bbaa0e51762cb0bb7e702286fb6b227e3d679c8e06b441069f2312'
    const appliedTxLog = '0xd9c2153f71337bb6fdf18527a3f89c6de15a82d0a11553472f2c5ae3e0d351ff'

    const daoAddress = '0x1F0EaCFf1029598DB879bA9F0E01E035481D2829'
    const pluginAddressTokenVoting = '0xfd30f6A658A82e8D2CBBCcea429371ac545ef62a'
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
    expect(plugins.length).to.eq(4)

    const tokenPlugin = plugins.find(w => w.address === pluginAddressTokenVoting)
    expect(tokenPlugin.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
    expect(tokenPlugin.status).to.eq(IPluginStatus.installed)
    expect(tokenPlugin.isSupported).to.be.true

    const token = await Models.Token.findOne({ address: tokenPlugin.tokenAddress, network })
    expect(token.type).to.eq(ITokenType.ERC20)
    expect(token.isGovernance).to.be.true

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('tokenvoting')

    const activeSettings = await Models.Setting.findActive({
      daoAddress,
      pluginAddress: pluginAddressTokenVoting,
      network,
    })
    expect(activeSettings.status).to.eq('active')

    const proposalCreatedTx = '0xf322ab4c771f8973b5481e2f4245f8a0645701842462ebda4300ea079e62538b'

    const proposalCreatedEvents = await UnitDepUtils.getData(
      TokenVoting.abi,
      'ProposalCreated',
      proposalCreatedTx,
      network,
    )

    for (const { event, logInfo } of proposalCreatedEvents) {
      await ProposalHandler.proposalCreated(event, logInfo)
    }

    const proposals = await Models.Proposal.find({
      id: '0xf322ab4c771f8973b5481e2f4245f8a0645701842462ebda4300ea079e62538b-0xfd30f6A658A82e8D2CBBCcea429371ac545ef62a-41981293179899666192778232992133842641974663734803984851385824614613996023303',
      network,
    })
    expect(proposals.length).to.eq(1)
    expect(proposals[0].snapshot.totalSupply).to.eq('1000000000000000000')
  })
})
