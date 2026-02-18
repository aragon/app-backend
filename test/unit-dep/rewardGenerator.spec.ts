import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ConfigIndexerHelper from '@helpers/configIndexer'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { ITokenType, NetworksEnum, type IIndexerConfig, GaugeLogs } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { expect } from 'chai'

const PLUGIN_ADDRESS = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'
const NETWORK = NetworksEnum.katanaMainnet
const FROM_BLOCK = 17593531

describe.only('Integ: RewardGenerator', function () {
  this.timeout(10000000)

  before(async () => {
    await LibUtils.registerPluginRepos(NETWORK)
  })

  it('should sync events and compute rewards', async function () {
    const escrowAddress = await GovernanceVeHelper.getEscrowAddress(PLUGIN_ADDRESS, NETWORK)
    expect(escrowAddress).to.be.a('string')

    const adapterAddress = await GaugeHelper.getIVotesAdapterAddress(escrowAddress!, NETWORK)
    expect(adapterAddress).to.be.a('string')

    const DAO_ADDRESS = '0x76De198A3175d046E10f872927C333D29Ff9B914'

    await Models.Plugin.create({
      id: `${NETWORK}-test-${PLUGIN_ADDRESS}`,
      transactionHash: '0x1dcd493cb88f80e4859b7891e49bd423724e118f9a928ec8a616cadc81d054eb',
      blockNumber: FROM_BLOCK,
      blockTimestamp: 1764336342,
      network: NETWORK,
      address: PLUGIN_ADDRESS,
      implementationAddress: PLUGIN_ADDRESS,
      interfaceType: 'gauge',
      status: 'installed',
      isSupported: true,
      daoAddress: DAO_ADDRESS,
      tokenAddress: adapterAddress!,
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

    await Models.Plugin.create({
      id: `${NETWORK}-test-tv-${PLUGIN_ADDRESS}`,
      transactionHash: '0x1dcd493cb88f80e4859b7891e49bd423724e118f9a928ec8a616cadc81d054eb',
      blockNumber: FROM_BLOCK,
      blockTimestamp: 1764336342,
      network: NETWORK,
      address: PLUGIN_ADDRESS,
      implementationAddress: PLUGIN_ADDRESS,
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: DAO_ADDRESS,
      tokenAddress: adapterAddress!,
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

    await Models.Setting.create({
      id: `0x1dcd493cb88f80e4859b7891e49bd423724e118f9a928ec8a616cadc81d054eb-${PLUGIN_ADDRESS}`,
      transactionHash: '0x1dcd493cb88f80e4859b7891e49bd423724e118f9a928ec8a616cadc81d054eb',
      blockNumber: FROM_BLOCK,
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

    const configGaugeLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(GaugeLogs).includes(item.event as any),
    )

    const gaugeCrawler = new BlockchainLogCrawler({
      parallel: { enable: true, useBatch: true, batchSize: 1000, autoScale: true },
      network: NETWORK,
      events: configGaugeLogs,
      address: [PLUGIN_ADDRESS],
      fromBlock: FROM_BLOCK,
      onError: async error => {
        console.error('Gauge crawl error:', error)
      },
      logService: ConfigIndexerHelper.builders.plugin('gauge' as any, NETWORK, PLUGIN_ADDRESS),
      stopOnError: true,
    })
    await gaugeCrawler.crawl()

    const delegateEvents = configIndexer.filter(item => item.event === 'DelegateChanged') as IIndexerConfig[]

    const delegateCrawler = new BlockchainLogCrawler({
      parallel: { enable: true, useBatch: true, batchSize: 1000, autoScale: true },
      network: NETWORK,
      events: delegateEvents,
      address: [adapterAddress!],
      fromBlock: FROM_BLOCK,
      onError: async error => {
        console.error('DelegateChanged crawl error:', error)
      },
      logService: ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, NETWORK, adapterAddress!),
      stopOnError: true,
    })
    await delegateCrawler.crawl()

    const delegateCount = await Models.LogDelegateChanged.countDocuments({
      tokenAddress: adapterAddress!,
      network: NETWORK,
    })
    expect(delegateCount).to.be.greaterThan(0)

    const veDelegateEvents = configIndexer.filter(
      (item: IIndexerConfig) => item.event === 'TokensDelegated' || item.event === 'TokensUndelegated',
    ) as IIndexerConfig[]

    const veDelegateCrawler = new BlockchainLogCrawler({
      parallel: { enable: true, useBatch: true, batchSize: 1000, autoScale: true },
      network: NETWORK,
      events: veDelegateEvents,
      address: [adapterAddress!],
      fromBlock: FROM_BLOCK,
      onError: async error => {
        console.error('VeDelegate crawl error:', error)
      },
      logService: ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, NETWORK, adapterAddress!),
      stopOnError: true,
    })
    await veDelegateCrawler.crawl()

    const tokenDelegationCount = await Models.TokenDelegation.countDocuments({
      contractAddress: adapterAddress!,
      network: NETWORK,
    })
    console.log(`  TokenDelegation logs: ${tokenDelegationCount}`)
    expect(tokenDelegationCount).to.be.greaterThan(0)

    const clockAddress = await GovernanceVeHelper.getClockAddress(PLUGIN_ADDRESS, NETWORK)
    const currentEpoch = await GaugeHelper.getCurrentEpoch(clockAddress!, NETWORK)
    const targetEpoch = currentEpoch! - 1

    const result = await new VeRewardDistribution({
      epochId: targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
    }).compute()

    expect(result).to.not.be.null
    expect(result!.ownerRewards).to.be.an('array')
    expect(result!.ownerRewards.length).to.be.greaterThan(0)

    const totalShareBps = result!.ownerRewards.reduce((sum, r) => sum + r.shareBps, 0n)
    expect(Number(totalShareBps)).to.be.at.most(10000)

    for (const inv of result!.invariants) {
      console.log(`  Invariant ${inv.name}: ${inv.pass ? 'PASS' : 'FAIL'} — ${inv.detail}`)
      if (inv.failures) console.log(`    Failures:`, inv.failures)
    }

    console.log(`  Owner rewards: ${result!.ownerRewards.length}`)
    for (const r of result!.ownerRewards) {
      console.log(`    owner=${r.owner} tokenIds=${r.tokenIds.length} vp=${r.votingPower} bps=${r.shareBps}`)
    }
  })
})
