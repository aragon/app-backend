import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import { BlockchainLogCrawler } from '@modules/crawlers'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { GaugeLogs, IVotingEscrowAdapterLogs, NetworksEnum, type HexAddress, type IIndexerConfig } from '@types'
import utils from '@helpers/utils'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'

const PLUGIN_ADDRESS = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9' as HexAddress
const NETWORK = NetworksEnum.katanaMainnet
const DAO_ADDRESS = '0x76De198A3175d046E10f872927C333D29Ff9B914' as HexAddress
const FIX_EPOCH = 0

const CACHE_DIR = path.join(__dirname, 'fixtures')
const CACHE_FILE = path.join(CACHE_DIR, `rewardGenerator-${PLUGIN_ADDRESS}.json`)

interface ICachedData {
  fromBlock: number
  transactionHash: string
  escrowAddress: string
  adapterAddress: string
  gaugeLogs: any[]
  delegationLogs: any[]
}

function loadCache(): ICachedData | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      console.log(`  Loading cached events from ${path.basename(CACHE_FILE)}`)
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    }
  } catch {
    console.log(`  Cache file corrupted, will re-crawl`)
  }
  return null
}

function saveCache(data: ICachedData): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(CACHE_FILE, utils.JSONStringifyCircular(data))
  console.log(`  Cached ${data.gaugeLogs.length} gauge + ${data.delegationLogs.length} delegation events`)
}

describe.only('Integ: RewardGenerator (batch-insert)', function () {
  this.timeout(10000000)

  let escrowAddress: string
  let adapterAddress: string
  let fromBlock: number
  let cached: ICachedData | null

  before(async () => {
    await LibUtils.registerPluginRepos(NETWORK)

    cached = loadCache()

    if (cached) {
      fromBlock = cached.fromBlock
      escrowAddress = cached.escrowAddress
      adapterAddress = cached.adapterAddress
    } else {
      // Resolve deployment block from explorer
      const creation = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, PLUGIN_ADDRESS, NETWORK)
      expect(Number(creation.blockNumber)).to.be.greaterThan(0)
      fromBlock = creation.blockNumber
      console.log(`  Plugin deployed at block ${fromBlock} (tx: ${creation.transactionHash})`)

      // Resolve escrow + adapter addresses on-chain
      escrowAddress = (await GovernanceVeHelper.getEscrowAddress(PLUGIN_ADDRESS, NETWORK))!
      expect(escrowAddress, 'escrow() returned null — check RPC config').to.be.a('string')

      adapterAddress = (await GaugeHelper.getIVotesAdapterAddress(escrowAddress, NETWORK))!
      expect(adapterAddress, 'iVotesAdapter() returned null').to.be.a('string')

      console.log(`  escrow=${escrowAddress}, adapter=${adapterAddress}`)
    }

    // Create gauge plugin
    await Models.Plugin.create({
      id: `${NETWORK}-test-${PLUGIN_ADDRESS}`,
      transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
      blockNumber: fromBlock,
      blockTimestamp: 1764336342,
      network: NETWORK,
      address: PLUGIN_ADDRESS,
      implementationAddress: PLUGIN_ADDRESS,
      interfaceType: 'gauge',
      status: 'installed',
      isSupported: true,
      daoAddress: DAO_ADDRESS,
      tokenAddress: adapterAddress,
      pluginSetupRepoAddress: PLUGIN_ADDRESS,
      sender: PLUGIN_ADDRESS,
      release: '1',
      build: '1',
      subdomain: 'gauge',
      uninstalled: { status: false, transactionHash: null, blockNumber: null, blockTimestamp: null },
      hasTarget: false,
      isProcess: false,
      isBody: false,
      isSubPlugin: false,
    })

    // Create tokenVoting plugin
    await Models.Plugin.create({
      id: `${NETWORK}-test-tv-${PLUGIN_ADDRESS}`,
      transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
      blockNumber: fromBlock,
      blockTimestamp: 1764336342,
      network: NETWORK,
      address: PLUGIN_ADDRESS,
      implementationAddress: PLUGIN_ADDRESS,
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: DAO_ADDRESS,
      tokenAddress: adapterAddress,
      pluginSetupRepoAddress: PLUGIN_ADDRESS,
      sender: PLUGIN_ADDRESS,
      release: '1',
      build: '1',
      subdomain: 'token-voting',
      uninstalled: { status: false, transactionHash: null, blockNumber: null, blockTimestamp: null },
      hasTarget: false,
      isProcess: false,
      isBody: false,
      isSubPlugin: false,
    })

    // Create setting
    await Models.Setting.create({
      id: `setting-${PLUGIN_ADDRESS}`,
      transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
      blockNumber: fromBlock,
      blockTimestamp: 1764336342,
      network: NETWORK,
      status: 'active',
      daoAddress: DAO_ADDRESS,
      pluginAddress: PLUGIN_ADDRESS,
      pluginSubdomain: 'blaxbluxtest139',
      tokenAddress: null,
      enabledUpdatedVotingPowerHook: true,
      stages: [],
      votingEscrow: {
        minDeposit: '1',
        minLockTime: 691200,
        maxTime: 0,
        slope: '0',
        bias: '1000000000000000000',
        cooldown: 3888000,
        feePercent: '2500',
        minFeePercent: '250',
        minCooldown: 1,
        feeType: null,
      },
    })
  })

  it('should batch-insert vote + delegation logs and compute rewards', async function () {
    let voteDocs: any[]
    let delegationDocs: any[]
    let resetLogs: any[]

    if (cached) {
      // --- Use cached events ---
      const votedLogs = cached.gaugeLogs.filter(l => l.info.eventName === 'Voted')
      resetLogs = cached.gaugeLogs.filter(l => l.info.eventName === 'Reset')

      voteDocs = votedLogs.map(log => ({
        id: Models.VoteGauge.getEntityId({
          network: log.info.network,
          transactionHash: log.info.transactionHash,
          transactionIndex: log.info.transactionIndex,
          logIndex: log.info.logIndex,
          pluginAddress: log.info.address,
        }),
        network: log.info.network,
        transactionHash: log.info.transactionHash,
        transactionIndex: log.info.transactionIndex,
        logIndex: log.info.logIndex,
        blockNumber: log.info.blockNumber,
        blockTimestamp: Number(log.event.args.timestamp),
        gaugeAddress: log.event.args.gauge,
        pluginAddress: log.info.address,
        memberAddress: log.event.args.voter,
        epochId: log.event.args.epoch.toString(),
        votingPower: log.event.args.votingPowerCastForGauge.toString(),
        persistentVote: true,
        resetVoteTransactionHash: null,
      }))

      delegationDocs = cached.delegationLogs.map(log => ({
        id: Models.TokenDelegation.getEntityId({
          network: log.info.network,
          transactionHash: log.info.transactionHash,
          transactionIndex: log.info.transactionIndex,
          logIndex: log.info.logIndex,
        }),
        network: log.info.network,
        contractAddress: log.info.address,
        delegator: log.event.args.sender,
        delegate: log.event.args.delegatee,
        tokenIds: log.event.args.tokenIds.map((t: any) => t.toString()),
        action: log.info.eventName === 'TokensDelegated' ? 'delegate' : 'undelegate',
        blockNumber: log.info.blockNumber,
        transactionHash: log.info.transactionHash,
        transactionIndex: log.info.transactionIndex,
        logIndex: log.info.logIndex,
      }))
    } else {
      // --- Crawl from chain ---
      const gaugeEventConfigs = configIndexer.filter((item: IIndexerConfig) =>
        [GaugeLogs.Voted, GaugeLogs.Reset].includes(item.event as GaugeLogs),
      )
      const delegationEventConfigs = configIndexer.filter((item: IIndexerConfig) =>
        [IVotingEscrowAdapterLogs.TokensDelegated, IVotingEscrowAdapterLogs.TokensUndelegated].includes(
          item.event as IVotingEscrowAdapterLogs,
        ),
      )

      const gaugeCrawler = new BlockchainLogCrawler({
        network: NETWORK,
        events: gaugeEventConfigs,
        address: [PLUGIN_ADDRESS],
        fromBlock,
        skipLogProcessing: true,
        onError: async error => console.error('Gauge crawl error:', error.message || error),
        stopOnError: false,
        batchSize: 5,
      })

      const delegationCrawler = new BlockchainLogCrawler({
        network: NETWORK,
        events: delegationEventConfigs,
        address: [adapterAddress],
        fromBlock,
        skipLogProcessing: true,
        onError: async error => console.error('Delegation crawl error:', error.message || error),
        stopOnError: false,
        batchSize: 5,
      })

      const [gaugeLogs, delegationLogs] = await Promise.all([gaugeCrawler.crawl(), delegationCrawler.crawl()])

      expect(gaugeLogs).to.be.an('array')
      expect(delegationLogs).to.be.an('array')

      // Convert ethers Result → plain object before serialization
      const toPlainLogs = (logs: any[]) =>
        logs.map(l => ({
          info: l.info,
          event: { name: l.event.name, args: l.event.args.toObject() },
        }))

      saveCache({
        fromBlock,
        transactionHash: '',
        escrowAddress,
        adapterAddress,
        gaugeLogs: toPlainLogs(gaugeLogs!),
        delegationLogs: toPlainLogs(delegationLogs!),
      })

      const votedLogs = gaugeLogs!.filter(l => l.info.eventName === 'Voted')
      resetLogs = gaugeLogs!.filter(l => l.info.eventName === 'Reset')

      voteDocs = votedLogs.map(log => ({
        id: Models.VoteGauge.getEntityId({
          network: log.info.network,
          transactionHash: log.info.transactionHash,
          transactionIndex: log.info.transactionIndex,
          logIndex: log.info.logIndex,
          pluginAddress: log.info.address,
        }),
        network: log.info.network,
        transactionHash: log.info.transactionHash,
        transactionIndex: log.info.transactionIndex,
        logIndex: log.info.logIndex,
        blockNumber: log.info.blockNumber,
        blockTimestamp: Number(log.event.args.timestamp),
        gaugeAddress: log.event.args.gauge,
        pluginAddress: log.info.address,
        memberAddress: log.event.args.voter,
        epochId: log.event.args.epoch.toString(),
        votingPower: log.event.args.votingPowerCastForGauge.toString(),
        persistentVote: true,
        resetVoteTransactionHash: null,
      }))

      delegationDocs = delegationLogs!.map(log => ({
        id: Models.TokenDelegation.getEntityId({
          network: log.info.network,
          transactionHash: log.info.transactionHash,
          transactionIndex: log.info.transactionIndex,
          logIndex: log.info.logIndex,
        }),
        network: log.info.network,
        contractAddress: log.info.address,
        delegator: log.event.args.sender,
        delegate: log.event.args.delegatee,
        tokenIds: log.event.args.tokenIds.map((t: any) => t.toString()),
        action: log.info.eventName === 'TokensDelegated' ? 'delegate' : 'undelegate',
        blockNumber: log.info.blockNumber,
        transactionHash: log.info.transactionHash,
        transactionIndex: log.info.transactionIndex,
        logIndex: log.info.logIndex,
      }))
    }

    console.log(`  Voted: ${voteDocs.length}, Reset: ${resetLogs.length}, Delegation: ${delegationDocs.length}`)

    // Insert both collections in parallel
    await Promise.all([
      voteDocs.length > 0 ? Models.VoteGauge.insertMany(voteDocs) : Promise.resolve(),
      delegationDocs.length > 0 ? Models.TokenDelegation.insertMany(delegationDocs) : Promise.resolve(),
    ])
    console.log(`  Inserted ${voteDocs.length} VoteGauge, ${delegationDocs.length} TokenDelegation docs`)

    // Apply Reset events (must run after VoteGauge insert)
    for (const resetLog of resetLogs) {
      const epochId =
        typeof resetLog.event.args.epoch === 'string' ? resetLog.event.args.epoch : resetLog.event.args.epoch.toString()
      await Models.VoteGauge.findOneAndUpdate(
        {
          network: resetLog.info.network,
          gaugeAddress: resetLog.event.args.gauge,
          memberAddress: resetLog.event.args.voter,
          pluginAddress: resetLog.info.address,
          epochId,
          resetVoteTransactionHash: null,
        },
        { $set: { resetVoteTransactionHash: resetLog.info.transactionHash } },
        { sort: { blockNumber: 1, logIndex: 1 } },
      )
    }
    console.log(`  Applied ${resetLogs.length} Reset events`)

    // Compute rewards
    const clockAddress = await GovernanceVeHelper.getClockAddress(PLUGIN_ADDRESS, NETWORK)
    const currentEpoch = await GaugeHelper.getCurrentEpoch(clockAddress!, NETWORK)
    const targetEpoch = currentEpoch! - 1

    console.log(`  Computing rewards for epoch ${targetEpoch}`)

    const result = await new VeRewardDistribution({
      epochId: FIX_EPOCH ? FIX_EPOCH : targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
    }).compute()

    // Assert invariants
    expect(result).to.not.be.null
    expect(result!.ownerRewards).to.be.an('array')
    expect(result!.ownerRewards.length).to.be.greaterThan(0)

    const totalShareBps = result!.ownerRewards.reduce((sum, r) => sum + r.shareBps, 0n)
    expect(Number(totalShareBps)).to.be.at.most(10000)

    for (const inv of result!.invariants) {
      console.log(`  Invariant ${inv.name}: ${inv.pass ? 'PASS' : 'FAIL'} — ${inv.detail}`)
      if (inv.failures) console.log(`    Failures:`, inv.failures)
      expect(inv.pass, `Invariant ${inv.name} failed: ${inv.detail}`).to.be.true
    }

    console.log(`  Owner rewards: ${result!.ownerRewards.length}`)
    for (const r of result!.ownerRewards) {
      console.log(`    owner=${r.owner} tokenIds=${r.tokenIds.length} vp=${r.votingPower} bps=${r.shareBps}`)
    }
  })
})
