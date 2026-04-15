import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { BlockchainLogCrawler } from '@modules/crawlers'
import PoolingCrawler from '@modules/poolingCrawler'
import ProviderModule from '@modules/provider'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe.skip('Integ: VE Batch Handler — Full DAO Simulation', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.katanaMainnet
  const daoAddress = '0xb72291652f15cF73651357383c0A86FBba29B675'
  const startBlock = 27092715
  const endBlock = 27093780
  const logService = ConfigIndexerHelper.builders.indexer(network)

  beforeEach(async function () {
    this.timeout(10000000)

    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    // --- DAO ---
    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      isActive: true,
      isHidden: false,
      network,
      transactionHash: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304',
      blockNumber: 23368834,
      blockTimestamp: 1770111645,
      address: daoAddress,
      implementationAddress: '0x8E241da6591d07a9f2480117b5d94dE4A63c4B3f',
      creatorAddress: '0xCe77fFD992001995B2079000111DA07F75606042',
      subdomain: null,
      metadataIpfs: 'ipfs://QmaNwP3uNWvvKopVsTDX4dG5Df9erS9CgAT2RHnsVuWPPv',
      name: 'Katana vKAT Management DAO',
      version: '1.4.0',
      metrics: {},
    })

    // --- Plugins ---

    // Gauge plugin (VE)
    await Models.Plugin.create({
      id: `${network}-0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304-0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352`,
      transactionHash: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304',
      blockNumber: 23368834,
      blockTimestamp: 1770111645,
      network,
      address: '0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352',
      implementationAddress: '0x25FCd22Bf758E5eac96D392cebeBDff83a2282a9',
      interfaceType: 'gauge',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress: '0xB67Ac05e2C1d8592692a90BF61712274b988f25A',
      pluginSetupRepoAddress: '0x6E00fC9cF62c2c78A850cf13e1dA1Ae48d940D01',
      sender: '0xCe77fFD992001995B2079000111DA07F75606042',
      release: '1',
      build: '1',
      subdomain: 'katanagaugevoter',
      uninstalled: { status: false },
      hasTarget: false,
      isProcess: false,
      isBody: false,
      isSubPlugin: false,
      votingEscrow: {
        curveAddress: '0x38b8B74330b2F918C22F7936aCf773C6D963C73c',
        exitQueueAddress: '0x6dE9cAAb658C744aD337Ca5d92D084c97ffF578d',
        escrowAddress: '0x4d6fC15Ca6258b168225D283262743C623c13Ead',
        clockAddress: '0x000000000000000000000000000000006981C2AF',
        nftLockAddress: '0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d',
        underlying: '0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d',
      },
    })

    // Multisig plugin
    await Models.Plugin.create({
      id: `${network}-0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304-0x69f9105DCc43bAaa78089Fcf811aaaD2C156D269`,
      transactionHash: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304',
      blockNumber: 23368834,
      blockTimestamp: 1770111645,
      network,
      address: '0x69f9105DCc43bAaa78089Fcf811aaaD2C156D269',
      implementationAddress: '0x9A09363C4b886025F9182E10B1081690B0B498D0',
      interfaceType: 'multisig',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress: null,
      pluginSetupRepoAddress: '0x5596451d7eDeA4cba96a181c5B8A31B93A62F7dF',
      sender: '0xCe77fFD992001995B2079000111DA07F75606042',
      release: '1',
      build: '3',
      subdomain: 'multisig',
      uninstalled: { status: false },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
    })

    // Capital distributor plugin
    await Models.Plugin.create({
      id: `${network}-0x59f438871555d331dcd97dbe861767a6683e3ed6dbe8149414cd9a8c5191c753-0x290503854c95Bfa44173d68f2E3e5AaFe073e220`,
      transactionHash: '0x59f438871555d331dcd97dbe861767a6683e3ed6dbe8149414cd9a8c5191c753',
      blockNumber: 23620252,
      blockTimestamp: 1770363063,
      network,
      address: '0x290503854c95Bfa44173d68f2E3e5AaFe073e220',
      implementationAddress: '0xB5aFc75D15Bd5077C331aBDFa2f704693E9bbB2D',
      interfaceType: 'capitalDistributor',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress: null,
      pluginSetupRepoAddress: '0x5a75f0C2c82747ac69f39d1450FF581B15358759',
      sender: '0x6DfAAEe5fA1d4B0EF453EC3E08883bC58966B503',
      release: '1',
      build: '1',
      subdomain: 'capital-distributor',
      uninstalled: { status: false },
      hasTarget: false,
      isProcess: false,
      isBody: false,
      isSubPlugin: false,
    })

    // --- Settings ---

    // Gauge setting
    await Models.Setting.create({
      id: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304-0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352',
      transactionHash: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304',
      blockNumber: 23368834,
      blockTimestamp: 1770111645,
      network,
      status: 'active',
      daoAddress,
      pluginAddress: '0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352',
      pluginSubdomain: 'katanagaugevoter',
      votingEscrow: {
        minDeposit: '500000000000000000',
        minLockTime: 1,
        maxTime: 0,
        slope: '0',
        bias: '1000000000000000000',
        cooldown: 3888000,
        feePercent: '8000',
        minFeePercent: '250',
        minCooldown: 1,
        feeType: 2,
      },
    })

    // Multisig setting
    await Models.Setting.create({
      id: '0x407c6594a27133826fd0d281ddcecca3d1a585c08f35962604ec234ab6eb5ad1-0x69f9105DCc43bAaa78089Fcf811aaaD2C156D269',
      transactionHash: '0x407c6594a27133826fd0d281ddcecca3d1a585c08f35962604ec234ab6eb5ad1',
      blockNumber: 27518813,
      blockTimestamp: 1774261624,
      network,
      status: 'active',
      daoAddress,
      pluginAddress: '0x69f9105DCc43bAaa78089Fcf811aaaD2C156D269',
      pluginSubdomain: 'multisig',
    })

    // --- Token ---
    await Models.Token.create({
      id: '0xB67Ac05e2C1d8592692a90BF61712274b988f25A-katana-mainnet',
      network,
      address: '0xB67Ac05e2C1d8592692a90BF61712274b988f25A',
      type: 'escrowAdapter',
      name: 'Katana Network Token',
      symbol: 'KAT',
      decimals: 18,
      isGovernance: true,
      hasDelegate: true,
      transactionHash: '0x905c5b075c4626cf08e4016ef1d64694d1995cf272dfd385b3b4f3437656f304',
      blockNumber: 23368834,
    })

    // --- ConfigIndexer ---
    await Models.ConfigIndexer.create({
      id: `${network}-${logService}`,
      network,
      service: logService,
      lastSync: startBlock,
    })

    // --- Fetch and process GaugeCreated/Activated events from gaugePlugin ---
    const gaugePluginAddress = '0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352'
    const gaugeIface = new Interface(GaugeVoter.abi)
    const gaugeTopics = [
      gaugeIface.getEvent('GaugeCreated')!.topicHash,
      gaugeIface.getEvent('GaugeActivated')!.topicHash,
    ]

    const provider = ProviderModule.getAnyRpcProvider(network)
    const limiter = BottleneckModule.getNodeLimiter(network)

    const gaugeLogs = (await limiter.schedule(() =>
      provider.getLogs({
        address: gaugePluginAddress,
        topics: [gaugeTopics],
        fromBlock: 23387484,
        toBlock: startBlock,
      }),
    )) as any[]

    if (gaugeLogs.length > 0) {
      // Get unique tx hashes sorted by block
      const txMap = new Map<string, number>()
      for (const log of gaugeLogs) {
        if (!txMap.has(log.transactionHash) || log.blockNumber < txMap.get(log.transactionHash)!) {
          txMap.set(log.transactionHash, log.blockNumber)
        }
      }
      const sortedTxHashes = [...txMap.entries()].sort((a, b) => a[1] - b[1]).map(([hash]) => hash)

      logger.info('Processing gauge setup events', { txCount: sortedTxHashes.length, gaugeLogs: gaugeLogs.length })
      await LibUtils.handleEventsFromTxHashes(sortedTxHashes, network)
    }
  })

  afterEach(() => {
    PoolingCrawler.instances.clear()
    sandbox?.restore()
  })

  it('should simulate realtime ticks with all events', async function () {
    this.timeout(10000000)

    // Phase 1: Small ticks (50 blocks) through the VE burst range
    // Phase 2: Switch to real latest and catch up
    const tickSize = 50
    let tickCount = 0
    let useRealLatest = false

    const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber')
    getBlockNumberStub.callsFake(async (blockOrTag: any, net: NetworksEnum) => {
      if (blockOrTag === 'latest' && net === network && !useRealLatest) {
        tickCount++
        const simulated = startBlock + tickSize * tickCount
        if (simulated > endBlock) useRealLatest = true
        return simulated
      }
      return (getBlockNumberStub.wrappedMethod as any).call(Web3Helper, blockOrTag, net)
    })

    // Full configIndexer — all event types + filterLogs routes VE events to batch handler
    const crawler = new BlockchainLogCrawler({
      network,
      events: configIndexer,
      filterLogs: async (logs: any) => PoolingCrawler.filterLogs(logs, network),
      onError: async (error: any) => logger.error('Crawler error', { error }),
      logService,
      stopOnError: true,
      batchSize: 0.1,
    })

    const startTime = Date.now()
    let tick = 0

    while (true) {
      tick++
      const tickStart = Date.now()

      await crawler.crawl()

      const tickDuration = Date.now() - tickStart
      const ci = await Models.ConfigIndexer.findOne({ service: logService, network })
      const realLatest = await (getBlockNumberStub.wrappedMethod as any).call(Web3Helper, 'latest', network)

      logger.info(`Tick ${tick}`, {
        lastSync: ci?.lastSync,
        realLatest,
        tickDuration: `${tickDuration}ms`,
        isRealtime: useRealLatest,
      })

      if (useRealLatest && ci?.lastSync && ci.lastSync >= realLatest - 5) {
        logger.info('Caught up to realtime, stopping')
        break
      }
    }

    const totalDuration = Date.now() - startTime

    const locks = await Models.Lock.countDocuments({ network })
    const delegations = await Models.TokenDelegation.countDocuments({ network })
    const members = await Models.Member.countDocuments({})
    const votes = await Models.VoteGauge.countDocuments({ network })

    logger.info('Simulation complete', {
      totalDuration: `${totalDuration}ms`,
      ticks: tick,
      locks,
      delegations,
      members,
      votes,
    })

    expect(locks).to.be.greaterThan(0)
    expect(delegations).to.be.greaterThan(0)
    expect(members).to.be.greaterThan(0)
  })
})
