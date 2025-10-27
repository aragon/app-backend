import { expect } from 'chai'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import * as sinon from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { IGovernanceErc20Logs, type IIndexerConfig, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import PoolingCrawler from '@modules/poolingCrawler'
import config from '@config'
import utils from '@helpers/utils'
import { TaskSchedulerState } from '@state/taskSchedulerState'

describe.skip('Integ: BlockchainLogCrawler', () => {
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

  it('should sync ARB delegateEvents in parallel and batch', async function () {
    this.timeout(10000000)

    const plugin = await Models.Plugin.create({
      id: 'arbitrum-mainnet-0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc-0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      transactionHash: '0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc',
      blockNumber: 331489081,
      blockTimestamp: 1745942228,
      network: 'arbitrum-mainnet',
      address: '0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      implementationAddress: '0xf52F568f41D2b337a2A949d7898BBa2fe077e941',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x0065Ae486bD7aBde37321F433a6700e3270317CD',
      tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      pluginSetupRepoAddress: '0x1AeD2BEb470aeFD65B43f905Bd5371b1E4749d18',
      sender: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      release: '1',
      build: '3',
      subdomain: 'token-voting',
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmZmW3yGV3sEB8t6wQUgVQuzsUHw72WcLb8Wo6n115VP6T',
      name: 'Import ARB',
      description: '',
      processKey: 'ARB',
      subPlugins: [],
      links: [],
    })
    const token = await Models.Token.create({
      id: '0x912CE59144191C1204E64559FE8253a0e49E6548-arbitrum-mainnet',
      network: 'arbitrum-mainnet',
      transactionHash: '0x9cdbb4672b549c26d97cac29f9cd73c1951656e0622ba4b9ed0abff2ee58698d',
      blockNumber: 70398215,
      type: 'ERC20',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      mintableByDao: false,
      implementationAddress: '0xC4ed0A9Ea70d5bCC69f748547650d32cC219D882',
      logo: 'https://assets.coingecko.com/coins/images/16547/small/arb.jpg?1721358242',
      skipFetchRate: true,
      isGovernance: true,
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      underlying: null,
      holders: 0,
      totalSupply: '0',
      priceChangeOnDayUsd: '-0.00042394000000001153',
      priceUsd: '0',
      hasDelegate: true,
      hasBalanceOfERC20: true,
      hasBalanceOfERC777: false,
      hasName: true,
      hasSymbol: true,
      hasDecimals: true,
      hasTotalSupply: true,
      refetch: false,
      hasClockMode: false,
      ignoreTransfer: true,
      clockMode: 'blocknumber',
    })

    const networkName = NetworksEnum.arbitrumMainnet
    const startTime = Date.now()

    logger.verbose('Start Token Sync', { startTime })

    // const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
    //   Object.values(IGovernanceErc20Logs).includes(item.event as any),
    // )

    const configGovLogs = configIndexer
      .filter((item: IIndexerConfig) => Object.values(IGovernanceErc20Logs).includes(item.event as any))
      .map((item: IIndexerConfig) => {
        // Override the handler for DelegateVotesChanged to use batch handler
        if (item.event === IGovernanceErc20Logs.DelegateVotesChanged) {
          return {
            ...item,
            config: item.config.map(cfg => ({
              ...cfg,
              handler: GovernanceErc20Handler.delegateVotesChangedBatch,
            })),
          }
        }
        return item
      })

    const tokenCrawler = new BlockchainLogCrawler({
      parallel: {
        enable: true,
        useBatch: true,
        batchSize: 1000,
        autoScale: true,
      },
      network: networkName,
      events: [...configGovLogs],
      address: [token.address],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => {
        console.error('Error LogTokenVoting', { error, log })
      },
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
    })

    await tokenCrawler.crawl()

    logger.verbose('End LogTokenVoting', {
      startTime,
      endTime: Date.now(),
    })
  })

  it('should sync BRG delegateEvents in parallel and batch', async function () {
    this.timeout(10000000)

    const plugin = await Models.Plugin.create({
      id: 'polygon-mainnet-0x6796a9641df93d7902c073eaa8b45019c27e53fb3872f761a2d0a3005da4cd41-0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
      transactionHash: '0x6796a9641df93d7902c073eaa8b45019c27e53fb3872f761a2d0a3005da4cd41',
      blockNumber: 40941779,
      blockTimestamp: 1680186182,
      network: 'polygon-mainnet',
      address: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
      implementationAddress: '0x8725b5f8247a0db0A5c6D86Db6Fb7A98F2Bd27f5',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
      tokenAddress: '0x613ef3f5959688c3b422A545906F844b6f8c8F35',
      pluginSetupRepoAddress: '0xae67aea0B830ed4504B36670B5Fa70c5C386Bb58',
      sender: '0x51Ead12DEcD31ea75e1046EdFAda14dd639789b8',
      release: '1',
      build: '1',
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
      __v: 1,
      blockedCountries: [],
      hasTarget: false,
      proposalCreationConditionAddress: '0x0000000000000000000000000000000000000000',
    })
    const token = await Models.Token.create({
      id: '0x613ef3f5959688c3b422A545906F844b6f8c8F35-polygon-mainnet',
      network: 'polygon-mainnet',
      transactionHash: '0x6796a9641df93d7902c073eaa8b45019c27e53fb3872f761a2d0a3005da4cd41',
      blockNumber: 40941779,
      type: 'ERC20',
      address: '0x613ef3f5959688c3b422A545906F844b6f8c8F35',
      mintableByDao: false,
      implementationAddress: '0x7B0189345261375c2dE9185Ca4CEbc1974827C09',
      logo: '',
      skipFetchRate: true,
      isGovernance: true,
      name: 'barukimang',
      symbol: 'BRG',
      decimals: 18,
      underlying: null,
      holders: 2,
      totalSupply: '10053000000000000000000',
      priceChangeOnDayUsd: '0',
      priceUsd: '0',
      hasDelegate: true,
      hasBalanceOfERC20: true,
      hasBalanceOfERC777: false,
      hasName: true,
      hasSymbol: true,
      hasDecimals: true,
      hasTotalSupply: true,
      hasClockMode: false,
      ignoreTransfer: false,
      refetch: false,
      clockMode: 'blocknumber',
    })

    const networkName = NetworksEnum.polygonMainnet
    const startTime = Date.now()

    logger.verbose('Start Token Sync', { startTime })

    // const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
    //   Object.values(IGovernanceErc20Logs).includes(item.event as any),
    // )

    const configGovLogs = configIndexer
      .filter((item: IIndexerConfig) => Object.values(IGovernanceErc20Logs).includes(item.event as any))
      .map((item: IIndexerConfig) => {
        // Override the handler for DelegateVotesChanged to use batch handler
        if (item.event === IGovernanceErc20Logs.DelegateVotesChanged) {
          return {
            ...item,
            config: item.config.map(cfg => ({
              ...cfg,
              handler: GovernanceErc20Handler.delegateVotesChangedBatch,
            })),
          }
        }
        return item
      })

    const tokenCrawler = new BlockchainLogCrawler({
      parallel: {
        enable: true,
        useBatch: true,
        batchSize: 1000,
        autoScale: true,
      },
      network: networkName,
      events: [...configGovLogs],
      address: [token.address],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => {
        console.error('Error LogTokenVoting', { error, log })
      },
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
    })

    await tokenCrawler.crawl()

    logger.verbose('End LogTokenVoting', {
      startTime,
      endTime: Date.now(),
    })
  })

  it('should sync ARB delegateEvents in parallel only - no batch', async function () {
    this.timeout(10000000)

    const plugin = await Models.Plugin.create({
      id: 'arbitrum-mainnet-0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc-0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      transactionHash: '0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc',
      blockNumber: 331489081,
      blockTimestamp: 1745942228,
      network: 'arbitrum-mainnet',
      address: '0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      implementationAddress: '0xf52F568f41D2b337a2A949d7898BBa2fe077e941',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x0065Ae486bD7aBde37321F433a6700e3270317CD',
      tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      pluginSetupRepoAddress: '0x1AeD2BEb470aeFD65B43f905Bd5371b1E4749d18',
      sender: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      release: '1',
      build: '3',
      subdomain: 'token-voting',
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmZmW3yGV3sEB8t6wQUgVQuzsUHw72WcLb8Wo6n115VP6T',
      name: 'Import ARB',
      description: '',
      processKey: 'ARB',
      subPlugins: [],
      links: [],
    })
    const token = await Models.Token.create({
      id: '0x912CE59144191C1204E64559FE8253a0e49E6548-arbitrum-mainnet',
      network: 'arbitrum-mainnet',
      transactionHash: '0x9cdbb4672b549c26d97cac29f9cd73c1951656e0622ba4b9ed0abff2ee58698d',
      blockNumber: 70398215,
      type: 'ERC20',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      mintableByDao: false,
      implementationAddress: '0xC4ed0A9Ea70d5bCC69f748547650d32cC219D882',
      logo: 'https://assets.coingecko.com/coins/images/16547/small/arb.jpg?1721358242',
      skipFetchRate: true,
      isGovernance: true,
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      underlying: null,
      holders: 0,
      totalSupply: '0',
      priceChangeOnDayUsd: '-0.00042394000000001153',
      priceUsd: '0',
      hasDelegate: true,
      hasBalanceOfERC20: true,
      hasBalanceOfERC777: false,
      hasName: true,
      hasSymbol: true,
      hasDecimals: true,
      hasTotalSupply: true,
      refetch: false,
      hasClockMode: false,
      ignoreTransfer: true,
      clockMode: 'blocknumber',
    })

    const networkName = NetworksEnum.arbitrumMainnet
    const startTime = Date.now()

    logger.verbose('Start Token Sync', { startTime })

    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const tokenCrawler = new BlockchainLogCrawler({
      parallel: {
        enable: true,
        autoScale: true,
      },
      network: networkName,
      events: [...configGovLogs],
      address: [token.address],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => {
        console.error('Error LogTokenVoting', { error, log })
      },
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
    })

    await tokenCrawler.crawl()

    logger.verbose('End LogTokenVoting', {
      startTime,
      endTime: Date.now(),
    })
  })

  it('should sync ARB delegateEvents in standard way', async function () {
    this.timeout(10000000)

    const plugin = await Models.Plugin.create({
      id: 'arbitrum-mainnet-0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc-0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      transactionHash: '0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc',
      blockNumber: 331489081,
      blockTimestamp: 1745942228,
      network: 'arbitrum-mainnet',
      address: '0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      implementationAddress: '0xf52F568f41D2b337a2A949d7898BBa2fe077e941',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x0065Ae486bD7aBde37321F433a6700e3270317CD',
      tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      pluginSetupRepoAddress: '0x1AeD2BEb470aeFD65B43f905Bd5371b1E4749d18',
      sender: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      release: '1',
      build: '3',
      subdomain: 'token-voting',
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmZmW3yGV3sEB8t6wQUgVQuzsUHw72WcLb8Wo6n115VP6T',
      name: 'Import ARB',
      description: '',
      processKey: 'ARB',
      subPlugins: [],
      links: [],
    })
    const token = await Models.Token.create({
      id: '0x912CE59144191C1204E64559FE8253a0e49E6548-arbitrum-mainnet',
      network: 'arbitrum-mainnet',
      transactionHash: '0x9cdbb4672b549c26d97cac29f9cd73c1951656e0622ba4b9ed0abff2ee58698d',
      blockNumber: 70398215,
      type: 'ERC20',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      mintableByDao: false,
      implementationAddress: '0xC4ed0A9Ea70d5bCC69f748547650d32cC219D882',
      logo: 'https://assets.coingecko.com/coins/images/16547/small/arb.jpg?1721358242',
      skipFetchRate: true,
      isGovernance: true,
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      underlying: null,
      holders: 0,
      totalSupply: '0',
      priceChangeOnDayUsd: '-0.00042394000000001153',
      priceUsd: '0',
      hasDelegate: true,
      hasBalanceOfERC20: true,
      hasBalanceOfERC777: false,
      hasName: true,
      hasSymbol: true,
      hasDecimals: true,
      hasTotalSupply: true,
      refetch: false,
      hasClockMode: false,
      ignoreTransfer: true,
      clockMode: 'blocknumber',
    })

    const networkName = NetworksEnum.arbitrumMainnet
    const startTime = Date.now()

    logger.verbose('Start Token Sync', { startTime })

    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const tokenCrawler = new BlockchainLogCrawler({
      parallel: false, // Disable parallel processing for standard/sequential mode
      network: networkName,
      events: [...configGovLogs],
      address: [token.address],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => {
        console.error('Error LogTokenVoting', { error, log })
      },
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
    })

    await tokenCrawler.crawl()

    logger.verbose('End LogTokenVoting', {
      startTime,
      endTime: Date.now(),
    })
  })

  it('should install ERC20 governance dao on arbitrum-mainnet + proposal and totalSupply', async function () {
    this.timeout(10000000) // 10000 seconds for stress test

    await Models.Plugin.create({
      id: 'arbitrum-mainnet-0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc-0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      transactionHash: '0xa60f066b6f34fd6bbd5a77e7a5c22b4165efd819a860c49ee8b5b4435f66c8dc',
      blockNumber: 331489081,
      blockTimestamp: 1745942228,
      network: 'arbitrum-mainnet',
      address: '0xdf7D3741a21dD3201690C18C731AE734cC5fb400',
      implementationAddress: '0xf52F568f41D2b337a2A949d7898BBa2fe077e941',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x0065Ae486bD7aBde37321F433a6700e3270317CD',
      tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      pluginSetupRepoAddress: '0x1AeD2BEb470aeFD65B43f905Bd5371b1E4749d18',
      sender: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      release: '1',
      build: '3',
      subdomain: 'token-voting',
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmZmW3yGV3sEB8t6wQUgVQuzsUHw72WcLb8Wo6n115VP6T',
      name: 'Import ARB',
      description: '',
      processKey: 'ARB',
      subPlugins: [],
      links: [],
    })
    await Models.Token.create({
      id: '0x912CE59144191C1204E64559FE8253a0e49E6548-arbitrum-mainnet',
      network: 'arbitrum-mainnet',
      transactionHash: '0x9cdbb4672b549c26d97cac29f9cd73c1951656e0622ba4b9ed0abff2ee58698d',
      blockNumber: 70398215,
      type: 'ERC20',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      mintableByDao: false,
      implementationAddress: '0xC4ed0A9Ea70d5bCC69f748547650d32cC219D882',
      logo: 'https://assets.coingecko.com/coins/images/16547/small/arb.jpg?1721358242',
      skipFetchRate: true,
      isGovernance: true,
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      underlying: null,
      holders: 0,
      totalSupply: '0',
      priceChangeOnDayUsd: '-0.00042394000000001153',
      priceUsd: '0',
      hasDelegate: true,
      hasBalanceOfERC20: true,
      hasBalanceOfERC777: false,
      hasName: true,
      hasSymbol: true,
      hasDecimals: true,
      hasTotalSupply: true,
      refetch: false,
      hasClockMode: false,
      ignoreTransfer: true,
      clockMode: 'blocknumber',
    })

    const networkName = NetworksEnum.arbitrumMainnet
    const logService = ConfigIndexerHelper.builders.indexer(networkName)

    const taskOptions = {
      fn: () => [[{ poolingCrawler: PoolingCrawler, params: { logService, network: networkName } }]],
      interval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL,
      checkInterval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL / 2,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => logger.error('Error pooling logs', { networkName, error }),
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask(logService, taskOptions)
  })
})
