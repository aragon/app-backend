import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { TokenHolderSync } from '@services/aragon-plugins/tokenHolderSync'
import { LogTokenVoting } from '@services/aragon-plugins/logTokenVoting'
import logger from '@logger'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import { ProxyMember } from '@modules/proxyMember'

describe.skip('Stress Test: BlockScout Token Holder Synchronization', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('bulkDaoMembershipManagement', async function () {
    const network = NetworksEnum.baseMainnet
    const daoAddress = '0x1234567890123456789012345678901234567890'
    const pluginAddress = '0x9876543210987654321098765432109876543210'
    const userAddress = '0x1234567890123456789012345678901234567891'
    const tokenAddress = '0x1111111111166b7FE7bd91427724B487980aFc69'

    await ProxyMember.optimizedDaoMembershipManagement(
      [
        {
          address: userAddress,
          value: '123123',
        },
      ],
      daoAddress,
      pluginAddress,
      tokenAddress,
      network,
      12313,
    )

    const memberBalance = await ProxyMember.getBalances({
      address: userAddress,
      network,
      tokenAddress,
    })

    expect(memberBalance?.amount).to.be.equal('123123')

    await memberBalance?.increaseBalance({
      amount: '1000',
      blockNumber: 12314,
    })

    const updatedBalance = await ProxyMember.getBalances({
      address: userAddress,
      network,
      tokenAddress,
    })

    expect(updatedBalance?.amount).to.be.equal('124123')
    expect(updatedBalance?.lastSyncAmountBlockNumber).to.be.equal(12314)
  })

  it('should perform complete BlockScout token sync and transition to real-time crawling', async function () {
    this.timeout(1800000) // 30 minutes for full sync

    const network = NetworksEnum.baseMainnet
    const tokenAddress = '0x1111111111166b7FE7bd91427724B487980aFc69'
    const daoAddress = '0x1234567890123456789012345678901234567890'
    const pluginAddress = '0x9876543210987654321098765432109876543210'

    const blockNumber = await Web3Helper.getBlockNumber('latest', network)

    const plugin = await Models.Plugin.create({
      id: `${network}-${daoAddress}-${pluginAddress}`,
      transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      blockNumber: blockNumber - 100,
      blockTimestamp: Date.now() / 1000,
      network,
      address: pluginAddress,
      implementationAddress: '0x0749047B49B472a7f80C1c8f0a4dbBcecBc54339',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress,
      pluginSetupRepoAddress: '0x424F4cA6FA9c24C03f2396DF0E96057eD11CF7dF',
      sender: '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e',
      release: '1',
      build: '2',
      subdomain: 'token-voting',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: null,
      name: null,
      description: null,
      processKey: null,
      subPlugins: [],
      links: [],
    })

    const token = await Models.Token.create({
      id: `${tokenAddress}-${network}`,
      network,
      address: tokenAddress,
      name: 'BlockScout Test Token',
      symbol: 'BSTEST',
      decimals: 18,
      type: 'ERC20',
      isGovernance: true,
      blockNumber: 26990278,
    })

    const originalCrawl = BlockchainLogCrawler.prototype.crawl
    const pluginCrawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
    pluginCrawlerStub.callsFake(async function (this: BlockchainLogCrawler) {
      if (this.crawlSetting.filter.address?.[0]! === pluginAddress) {
        logger.info('Mocking plugin crawler to skip plugin event processing')
        return
      }
      return originalCrawl.call(this)
    })

    const startTime = Date.now()
    let initialMemberCount = 0
    let initialTransactionCount = 0
    let finalMemberCount = 0
    let finalTransactionCount = 0

    initialMemberCount = await Models.Member.countDocuments()
    initialTransactionCount = await Models.MemberTransaction.countDocuments()

    logger.info('Starting BlockScout token holder sync stress test', {
      network,
      tokenAddress,
      pluginAddress,
      daoAddress,
      initialMemberCount,
      initialTransactionCount,
    })

    const optimizedFlowNeeded = await TokenHolderSync.isOptimizedFlowNeeded(token, plugin)
    expect(optimizedFlowNeeded).to.be.true

    await LogTokenVoting.start(plugin, token, true)

    const syncDuration = Date.now() - startTime

    finalMemberCount = await Models.Member.countDocuments()
    finalTransactionCount = await Models.MemberTransaction.countDocuments()

    const remainingSyncTags = await Models.ConfigIndexer.find({
      network,
      service: {
        $regex: `${plugin.interfaceType}-${network}-${pluginAddress}-${tokenAddress}`,
      },
    })

    const defaultTag = remainingSyncTags.find(
      tag => tag.service === TokenHolderSync.getTagName(plugin, token, 'default' as any),
    )

    const memberBalances = await Models.MemberBalance.find({
      network,
      tokenAddress,
    })

    const daoMemberships = await Models.DaoMember.find({
      network,
      daoAddress,
      pluginAddress,
    })

    logger.info('BlockScout sync stress test completed', {
      network,
      tokenAddress,
      duration: `${(syncDuration / 1000).toFixed(2)} seconds`,
      membersCreated: finalMemberCount - initialMemberCount,
      transactionsCreated: finalTransactionCount - initialTransactionCount,
      memberBalancesCreated: memberBalances.length,
      daoMembershipsCreated: daoMemberships.length,
      remainingSyncTags: remainingSyncTags.length,
      hasDefaultTag: !!defaultTag,
    })

    // Assertions
    expect(finalMemberCount).to.be.greaterThan(initialMemberCount, 'Should create new members')
    expect(finalTransactionCount).to.be.greaterThan(initialTransactionCount, 'Should create new transactions')
    expect(memberBalances.length).to.be.greaterThan(0, 'Should create member balances')
    expect(daoMemberships.length).to.be.greaterThan(0, 'Should create DAO memberships')
    expect(defaultTag).to.exist('Should have default sync tag for real-time crawling')
    expect(defaultTag.lastSync).to.be.greaterThan(0, 'Default tag should have valid lastSync block')

    // Test that we can now do real-time sync
    logger.info('Testing transition to real-time sync')
    const realtimeStartTime = Date.now()

    // This should now use the standard BlockchainLogCrawler flow
    await LogTokenVoting.start(plugin, token, false)

    const realtimeDuration = Date.now() - realtimeStartTime

    logger.info('Real-time sync test completed', {
      duration: `${(realtimeDuration / 1000).toFixed(2)} seconds`,
    })

    // Real-time sync should be much faster
    expect(realtimeDuration).to.be.lessThan(syncDuration, 'Real-time sync should be faster than initial sync')
  })
})
