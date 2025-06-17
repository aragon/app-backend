import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, IGovernanceErc20Logs } from '@types'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import PoolingCrawler from '@modules/poolingCrawler'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'
import { type Log } from 'ethers'
import ProviderModule from '@src/modules/provider'
import logger from '@logger'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Stress Test: Large Token Transfers', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should process large token transfers using direct BlockchainLogCrawler', async function () {
    this.timeout(1600000)

    const network = NetworksEnum.baseMainnet
    const tokenAddress = '0x1111111111166b7FE7bd91427724B487980aFc69'
    const daoAddress = '0x1234567890123456789012345678901234567890'
    const pluginAddress = '0x9876543210987654321098765432109876543210'

    await Models.Plugin.create({
      id: `${network}-0x1234567890123456789012345678901234567890-${pluginAddress}`,
      transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      blockNumber: 18000000,
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

    await Models.Token.create({
      id: `${tokenAddress}-${network}`,
      network,
      address: tokenAddress,
      name: 'Stress Test Token',
      symbol: 'STRESS',
      decimals: 18,
      type: 'ERC20',
      isGovernance: true,
    })

    const transferLogs = configIndexer.filter(config =>
      Object.values(IGovernanceErc20Logs).includes(config.event as IGovernanceErc20Logs),
    )

    const provider = ProviderModule.getAnyRpcProvider(network)
    const latestBlock = await provider.getBlockNumber()
    const fromBlock = latestBlock - 100

    let processedLogsCount = 0

    const stressCrawler = new BlockchainLogCrawler({
      network,
      fromBlock,
      toBlock: latestBlock,
      events: transferLogs,
      onError: async (error: any) => console.error('Stress test crawler error:', error),
      logService: null,
      stopOnError: false,
      batchSize: 0.01,
      skipLogProcessing: true,
      filterLogs: async (logs: Log[]) => {
        const filteredLogs = await PoolingCrawler.filterLogs(logs, network)

        if (filteredLogs.length === 0) {
          return []
        }

        await TransferCrawler.parseAndProcessTransferLogs(filteredLogs, network)
        processedLogsCount += filteredLogs.length
        return filteredLogs
      },
    })

    const startTime = Date.now()

    logger.info(`Starting stress test for ${network} network`, {
      network,
      fromBlock,
      latestBlock,
      transferLogsCount: transferLogs.length,
    })

    await stressCrawler.crawl()

    const totalDuration = Date.now() - startTime

    logger.info(`Stress test completed for`, {
      network,
      duration: `${(totalDuration / 1000).toFixed(2)} seconds`,
      processedLogs: processedLogsCount,
      fromBlock,
      latestBlock,
    })

    const memberCount = await Models.Member.countDocuments()
    const transactionCount = await Models.MemberTransaction.countDocuments()

    console.log(`Created ${memberCount} members and ${transactionCount} transactions`)

    expect(memberCount).to.be.greaterThan(0)
    expect(transactionCount).to.be.greaterThan(0)
  })
})
