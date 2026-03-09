import config from '@config'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import ProviderModule from '@modules/provider'
import { BatchRequestManager, CrawlerErrorHandler } from '@modules/crawlers'
import { CrawlerErrorType, IConnectionType, IProviderType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: Batch Request', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.skip('usage of batch request with custom node', async function () {
    this.timeout(100000)

    await ProviderModule.connectToAllNetworks()
    const rpc = ProviderModule.getProvider(NetworksEnum.ethereumSepolia, IProviderType.ARAGON, IConnectionType.RPC)

    //here we are spying on the _send method of the rpc provider which sends the request to the node
    const sendSpy = sinon.spy(rpc, '_send')

    const blockIntervalTime = config.NODES[utils.networkToAragon(NetworksEnum.ethereumSepolia)].INTERVAL_BLOCK_TIME

    const startBlock = 6061015
    const endBlock = 6099999
    const SECONDS_IN_MONTH = 120 * 24 * 3600
    const batchSize = Math.floor(SECONDS_IN_MONTH / blockIntervalTime)

    const batches: any = []
    for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, endBlock)
      batches.push({ fromBlock, toBlock })
    }

    const fetchLogsForTopics = async (topicsSubset: any, { fromBlock, toBlock }) => {
      return rpc.send('eth_getLogs', [
        {
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: topicsSubset,
        },
      ])
    }

    const topics = configIndexer
      .filter(c => c.enableHistorical)
      .map(config => config.topic || null)
      .filter(topic => topic)
    const topicBatches: any = []
    const maxTopicsPerQuery = 4
    for (let i = 0; i < topics.length; i += maxTopicsPerQuery) {
      topicBatches.push(topics.slice(i, i + maxTopicsPerQuery))
    }

    const logsPromises: any = []
    for (const batch of batches) {
      for (const topicsSubset of topicBatches) {
        logsPromises.push(fetchLogsForTopics(topicsSubset, batch))
      }
    }

    const logsResults = (await Promise.all(logsPromises)).flat()
    expect(logsResults.length).to.be.gt(0)
    //we expect the send method to be called only once as we are batching the requests
    expect(sendSpy.callCount).to.be.eq(1)

    await rpc.send('eth_blockNumber', [])
    await rpc.send('eth_chainId', [])

    //we expect the send method to be called 3 times as we are sending 2 requests above and its not batched
    expect(sendSpy.callCount).to.be.eq(3)
  })

  it('test error handling in batch request - dRPC polygon 10k block limit', async function () {
    this.timeout(30000)

    await ProviderModule.connectToAllNetworks()

    const pluginAddress = '0x17369414cDba3E6ea8f21BdC0a0d001Df23bCF67'
    const proposalCreatedTopic = '0xa6c1f8f4276dc3f243459e13b557c84e8f4e90b2e09070bad5f6909cee687c92'

    // Range exceeding 10k blocks — this triggers dRPC's polygon limit
    const fromBlock = 75118470
    const toBlock = 77710470

    const batchManager = new BatchRequestManager({
      network: NetworksEnum.polygonMainnet,
      address: [pluginAddress],
    })

    const errorHandler = new CrawlerErrorHandler()

    // executeBatchRequest should return the error as a response (not throw)
    // because isBatchSizeError should now correctly identify it
    const result = await batchManager.executeBatchRequest([proposalCreatedTopic], fromBlock, toBlock)

    // Should return an error response (batch size error is returned, not thrown)
    expect(result).to.be.an('array')
    expect(result.length).to.be.gte(1)

    const hasError = result.some((r: any) => r.error)
    expect(hasError, 'Should contain an error response from dRPC').to.be.true

    // Verify the error is classified as BATCH_SIZE_ERROR by the error handler
    const errorResponse = result.find((r: any) => r.error)
    const errorType = errorHandler.classifyError(errorResponse!.error)
    expect(errorType).to.equal(CrawlerErrorType.BATCH_SIZE_ERROR)

    // Verify a small range works fine
    const smallResult = await batchManager.executeBatchRequest(
      [proposalCreatedTopic],
      fromBlock,
      fromBlock + 5000, // well within 10k limit
    )
    expect(smallResult).to.be.an('array')
    const smallHasError = smallResult.some((r: any) => r.error)
    expect(smallHasError, 'Small range should succeed without errors').to.be.false
  })
})
