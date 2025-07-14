import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IndexerType, ITokenType, NetworksEnum } from '@types'
import utils from '@helpers/utils'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import { ProxyToken } from '@modules/proxyToken'
import ConfigIndexerHelper from '@helpers/configIndexer'

describe('Manual: BathRequest', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(160000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()
    const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network: NetworksEnum.ethereumMainnet,
      events: configLogs,
      onError: async (error: any) => console.log('Error Indexer', error),
      logService: ConfigIndexerHelper.builders.indexer(NetworksEnum.ethereumMainnet),
      stopOnError: true,
    })
    await crawler.crawl()

    await ProxyToken.saveAndGetToken('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', NetworksEnum.ethereumMainnet)
  })
})
