import sinon from 'sinon'
import { Models } from '@dbModels'
import { IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import MemberController from '@api/controllers/member'
import { GovernanceVeHandler } from '@src/handlers/governanceVeHandler'
import { ExitQueue } from '@artifacts/ExitQueue'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import Web3Helper from '@helpers/web3'
import { DaoRegistryHandler } from '@src/handlers/daoRegistryHandler'
import { DAORegistry } from '@src/aragonContracts'
import ProxyWeb3Provider from '@src/modules/proxyProvider'

describe('Integ: VeLock', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe(`VeLock Test`, () => {
    const networks = [
      {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0x9418fcf1Aa0dCEB9090F2bBA06E70d94E10e46b1',
      },
    ]

    for (const { network, daoAddress } of networks) {
      it(`should handle veLock all events properly ${network}`, async function () {
        this.timeout(100000000)

        await UnitDepUtils.syncACompleteDao(daoAddress, network)
        const plugins = await Models.Plugin.find({
          daoAddress,
        })
        expect(plugins).to.be.an('array')
        expect(plugins.length).to.be.gt(1)

        const veLockPlugin = plugins.find(plugin => plugin.votingEscrow !== null)
        expect(veLockPlugin).to.be.exist
        const token = await Models.Token.findOne({
          address: veLockPlugin.tokenAddress,
        })

        await LogTokenVoting.start(veLockPlugin, token)

        const members = await MemberController.getMembersWithPagination(
          {
            page: 1,
            limit: 100,
            sort: 'votingPower',
            order: 'desc',
          },
          {
            daoAddress,
            network: veLockPlugin.network,
            pluginAddress: veLockPlugin.address,
          },
        )

        if (network === NetworksEnum.ethereumSepolia) {
          expect(members.data.length).to.eq(2)
          const sortedMembers = members.data.sort(
            (a: any, b: any) => parseFloat(b.votingPower) - parseFloat(a.votingPower),
          )
          expect(members.data).to.deep.equal(sortedMembers)
          expect(members.data[0].address).to.be.exist
          expect(members.data[0].votingPower).to.be.exist
          expect(members.data[0].ens).to.be.exist
          expect(members.data[0].metrics).to.be.exist
          expect(members.data[0].metrics.firstActivity).to.be.exist
          expect(members.data[0].metrics.lastActivity).to.be.exist
        }
      })
    }
  })

  it('should install veGovernace dao on ethereum-sepolia', async function () {
    this.timeout(10000000)

    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(null as any)

    const daoInstallTx = '0xe1cc02b4d2400658711f1c87ee2ce108ef2cb7862423892211eb828bfc7165f1'
    const preparTxLog = '0xe5547f3c864ff4d2e38133ec2ea17429e73541a2d2177913705127c3ecf144e7'
    const appliedTxLog = '0x093e19edb2f247790741fe4dc78d82389e0e330f92d51f5f3d56a29b1d33e78b'

    const daoAddress = '0x1EC71803dfD1e53188C7c446F171f9239C2DF073'
    const pluginAddressTokenVoting = '0x6c543e5213da4a5B9aC3A808374ad1E17Ca3B88c'
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
    expect(tokenPlugin.votingEscrow.curveAddress).to.eq('0x411eBcc6F366f89D2b639CFD41fDEE60151E0f0a')
    expect(tokenPlugin.votingEscrow.exitQueueAddress).to.eq('0x334ea5a1Ec1F77C6f76962C436ca39072cd70b80')
    expect(tokenPlugin.votingEscrow.escrowAddress).to.eq('0xC80fB31F6E83098b9240B47b377370048613C4F2')
    expect(tokenPlugin.votingEscrow.clockAddress).to.eq('0x3121Ac3E0A21Fad090A37799D49A089B9B692322')
    expect(tokenPlugin.votingEscrow.nftLockAddress).to.eq('0x3D2732736289341746A4C0FE32408863e9CBFf02')
    expect(tokenPlugin.votingEscrow.underlying).to.eq('0x54686256DC19b0c07A72B5054F6F9Ec42A6e52c7')

    const token = await Models.Token.findOne({ address: tokenPlugin.tokenAddress, network })
    expect(token.type).to.eq(ITokenType.escrowAdapter)
    expect(token.isGovernance).to.be.true
    expect(!!token.name).to.be.true

    const tokenVotingSlug = await Models.PluginSlug.findOne({ pluginAddress: pluginAddressTokenVoting, network })
    expect(tokenVotingSlug.slug).to.eq('mama')

    const activeSettings = await Models.Setting.findActive({
      daoAddress,
      pluginAddress: pluginAddressTokenVoting,
      network,
    })
    expect(activeSettings.votingEscrow.minDeposit).to.eq('100000000000000000000')
    expect(activeSettings.votingEscrow.minLockTime).to.eq(60)
    expect(activeSettings.votingEscrow.maxTime).to.eq(6048000)
    expect(activeSettings.votingEscrow.slope.toString()).to.eq('1653439153439')
    expect(activeSettings.votingEscrow.bias.toString()).to.eq('1000000000000000000')
    expect(activeSettings.votingEscrow.cooldown).to.eq(60)

    const depositTx = '0xd2d324dd4821354768bfbe8b9a61edc628d12e9ffbcd72f00cebb6c566aab161'
    const depositMintNftId = '6'
    const memberAddress = '0x6818013d7B2D49D7396BA9733b59C539A639f3ED'

    const depositEvents = await UnitDepUtils.getData(VotingEscrowIncreasing.abi, 'Deposit', depositTx, network)

    for (const { event, logInfo } of depositEvents) {
      await GovernanceVeHandler.deposit(event, logInfo)
    }

    const locks = await Models.Lock.find({
      escrowAddress: '0xC80fB31F6E83098b9240B47b377370048613C4F2',
      tokenAddress: tokenPlugin.tokenAddress,
      network,
    })
    expect(locks[0].tokenId).to.eq(depositMintNftId.toString())
    expect(locks[0].memberAddress).to.eq(memberAddress)

    const exitQueueTx = '0x8ce4405c3c255f5bb4de37175328f92aa14c0ade8d6361125800a49b942230c2'

    const exitQueueEvents = await UnitDepUtils.getData(ExitQueue.abi, 'ExitQueued', exitQueueTx, network)

    for (const { event, logInfo } of exitQueueEvents) {
      await GovernanceVeHandler.exitQueued(event, logInfo)
    }

    const updatedLock = await locks[0].reload()
    expect(updatedLock.lockExit.status).to.be.true
  })
})
