import { Models } from '@dbModels'
import utils from '@helpers/utils'
import Utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import IPFSModule from '@modules/ipfs'
import ProviderModule from '@modules/provider'
import AragonPlugin from '@services/aragon-plugins/index'
import { ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe.skip('Manual: Setting Issue', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    //start the aragon plugin rabbitmq
    await AragonPlugin.start()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get events and find the issue', async function () {
    this.timeout(1600000)
    await ProviderModule.connectToAllNetworks()

    const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network: NetworksEnum.ethereumSepolia,
      events: configLogs,
      fromBlock: 7304452,
      toBlock: 7304545,
      onError: async (error: any) => logger.error('Error Indexer', error),
      logService: null,
      stopOnError: true,
      skipLogProcessing: false,
    })

    sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
      name: 'Test',
      description: 'Test',
      avatar: 'Test',
      links: [],
      processKey: 'Test',
      stageNames: ['Test', 'Test2'],
    })

    await crawler.crawl()

    await Utils.wait(20000)

    //wait for the plugin to process the logs

    const pluginSettings = await Models.Setting.find(
      { pluginAddress: '0xE42C311165AF57274e6Ea05De47FbeE40B84a0B1' },
      { $sort: { blockNumber: -1 } },
    )

    expect(pluginSettings.length).to.be.eq(2)
    expect(pluginSettings[0].status).to.be.eq(ISettingStatus.active)
    expect(pluginSettings[1].status).to.be.eq(ISettingStatus.inactive)

    console.log(pluginSettings)
  })
})
