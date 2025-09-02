import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IConnectionType, IProviderType, NetworksEnum } from '@types'
import { expect } from 'chai'
import config from '@config'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'

describe.skip('Integ: Batch Request', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('usage of batch request with custom node', async function () {
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
})
