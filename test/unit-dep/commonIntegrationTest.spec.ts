import * as sinon from 'sinon'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'

describe('Basic Integer Test', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should parse native token deposited event with crawler', async () => {
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.arbitrumMainnet,
      logService: null,
      events: configIndexer,
      onError: async (error: any) => logger.error('Error Indexer'),
      stopOnError: true,
    })

    const txHash = '0x54269603d0ecf623502c2fc683fe2228c04c3ae93405984d7de50ec2ee9662dd'

    const receipt = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.arbitrumMainnet)

    if (!receipt) {
      return
    }

    const log = receipt.logs.find(
      log => log.topics[0] === '0x62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3',
    )

    const formatted = crawler.formatLog(log!)

    expect(!!formatted.event).to.be.true
    expect(formatted.event.name).to.equal('NativeTokenDeposited')
  })
})
