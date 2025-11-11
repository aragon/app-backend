import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import sinon from 'sinon'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
describe.skip('ToolsFixSettingIssue', () => {
  before(async () => {
    await ProviderModule.connectToAllNetworks()
  })

  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should fix the plugin issue', async function () {
    this.timeout(1600000) // Increase timeout for the test

    const transactionHash = '0xbc7aad6d368981b7a3351119c52b6fd178f7f1e9c784191cb29f871edbe16a39'

    const repo = {
      id: 'ethereum-mainnet-0x768c5daa9a9a6f964c625731959aeff4f8cf2e55c596678f41f99639d997cb53-127-274',
      transactionHash: '0x768c5daa9a9a6f964c625731959aeff4f8cf2e55c596678f41f99639d997cb53',
      transactionIndex: 127,
      logIndex: 274,
      blockNumber: 16721878,
      blockTimestamp: 1677529331,
      network: 'ethereum-mainnet',
      subdomain: 'token-voting',
      pluginRepo: '0xb7401cD221ceAFC54093168B814Cc3d42579287f',
    }

    await Models.PluginRepo.create(repo)

    const events = await Web3Helper.getTransactionReceipt(transactionHash, NetworksEnum.ethereumMainnet)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      events: configIndexer,
      address: ['0xC51aE925Dad3C2E5660B267E43B8D0447Da59035'],
      fromBlock: 17741163,
      onError: async (_error: any, _log: any) => {},
      logService: null,
      stopOnError: true,
    })

    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    const processedLogs = events?.logs.map(log => crawler.formatLog(log)).filter(log => log)

    for (const log of processedLogs!) {
      const { event, handler, info } = log
      await handler(event, info, true)
    }
  })
})
