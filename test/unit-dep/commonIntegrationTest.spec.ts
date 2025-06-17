import * as sinon from 'sinon'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import configIndexer from '@indexer/configIndexer'
import Web3Helper from '@helpers/web3'
import { expect } from 'chai'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import logger from '@logger'
import Web3BatchHelper from '@helpers/web3BatchHelper'

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

  it('should investigate error getting past votes', async () => {
    const memberAddress = '0xe858f73188F9f85748550A8521822a9Bc741a676'
    const network = NetworksEnum.polygonMainnet
    const tokenAddress = '0x46122a25470728244fB45Fe3955F965e6ccf8fB8'
    const blockNumber = 72863483
    const blockTimestamp = 1750129619

    const originalEthCall = Web3BatchHelper.ethCall
    const forcedBlockNumberHex = '0x' + blockNumber.toString(16)

    const execBatchSpy = sandbox.spy(Web3BatchHelper, 'executeBatch')

    sandbox.stub(Web3BatchHelper, 'ethCall').callsFake(async (calls, networkParam, _blockTag?) => {
      return originalEthCall.call(Web3BatchHelper, calls, networkParam, forcedBlockNumberHex)
    })

    const pastVotes = await GovernanceErc20Helper.getPastVotes(
      memberAddress,
      tokenAddress,
      blockNumber,
      blockTimestamp,
      network,
    )

    logger.info('Past Votes:', {
      pastVotes: pastVotes,
    })

    const ethCallStub = Web3BatchHelper.ethCall as sinon.SinonStub
    expect(ethCallStub.callCount).to.be.eq(2)
    expect(execBatchSpy.callCount).to.be.eq(2)
    expect(execBatchSpy.firstCall.args[0][0].params[1]).to.be.eq(forcedBlockNumberHex)
    expect(execBatchSpy.secondCall.args[0][0].params[1]).to.be.eq(forcedBlockNumberHex)
  })
})
