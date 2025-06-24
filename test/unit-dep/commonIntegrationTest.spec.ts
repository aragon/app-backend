import * as sinon from 'sinon'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import configIndexer from '@indexer/configIndexer'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import logger from '@logger'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import ProxyContractHelper from '@helpers/proxyContract'

describe('Basic Integer Test', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should parse native token deposited event with crawler', async function () {
    this.timeout(1000000)
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.arbitrumMainnet,
      logService: null,
      events: configIndexer,
      onError: async (_error: any) => logger.error('Error Indexer'),
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


  it('should grab the proxy address from a contract', async () => {
    const implementationAddress = await ProxyContractHelper.getImplementationAddress(
      '0xb2868238c57D3E21bcF8f91FB1d45e4D60064a9a',
      NetworksEnum.cornMainnet,
    )

    expect(implementationAddress).to.be.eq('0x604953e159562FeEfF38961541415B0C0694Ef5A')

    const proxyAddress = await ProxyContractHelper.getImplementationAddress(
      '0x5dEA8E499b05de8F86E7521F039770268055b23F',
      NetworksEnum.ethereumMainnet,
    )

    expect(proxyAddress).to.be.eq('0x52Af16664155608b845BE18aa29620EbF6eA2D3a')
  })
})
