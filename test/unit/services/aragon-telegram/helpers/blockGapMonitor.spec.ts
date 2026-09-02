import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworkHelper } from '@helpers/network'
import Web3Helper from '@helpers/web3'
import { BlockGapMonitor } from '@services/aragon-telegram/helpers/blockGapMonitor'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStub } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const BLOCK_TIME = 12

const seedProgress = async (lastSync: number, network: NetworksEnum = NETWORK) =>
  Models.ConfigIndexer.create({
    network,
    service: ConfigIndexerHelper.builders.indexer(network),
    lastSync,
  })

describe('AragonTelegram: BlockGapMonitor', () => {
  let sandbox: SinonSandbox
  let blockNumberStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    BlockGapMonitor.resetShared()

    sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NETWORK }] as any)
    sandbox.stub(NetworkHelper, 'getAverageBlockTime').returns(BLOCK_TIME)
    blockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(1000)
  })

  afterEach(() => {
    sandbox.restore()
    BlockGapMonitor.resetShared()
  })

  it('reports the gap between the chain head and the last indexed block', async () => {
    // lastSync is the next block to crawl, so block 899 is the last one indexed
    await seedProgress(900)

    const [reading] = await BlockGapMonitor.read()

    expect(reading.lastIndexed).to.equal(899)
    expect(reading.chainHead).to.equal(1000)
    expect(reading.lagSeconds).to.equal(101 * BLOCK_TIME)
  })

  it('reports no lag when the indexer has caught up with the chain head', async () => {
    await seedProgress(1001)

    const [reading] = await BlockGapMonitor.read()

    expect(reading.lagSeconds).to.equal(0)
  })

  it('leaves out a network the indexer has never synced', async () => {
    expect(await BlockGapMonitor.read()).to.deep.equal([])
  })

  it('leaves out a network whose chain head cannot be read', async () => {
    await seedProgress(900)
    blockNumberStub.resolves(-1)

    expect(await BlockGapMonitor.read()).to.deep.equal([])
  })

  it('ignores plugin rows so each network reports a single reading', async () => {
    await seedProgress(900)
    await Models.ConfigIndexer.create({
      network: NETWORK,
      service: ConfigIndexerHelper.builders.plugin('multisig' as any, NETWORK, '0xabc'),
      lastSync: 10,
    })

    const readings = await BlockGapMonitor.read()

    expect(readings).to.have.length(1)
    expect(readings[0].lastIndexed).to.equal(899)
  })

  it('measures once for the gauges that collect together in a single scrape', async () => {
    await seedProgress(900)

    await Promise.all([BlockGapMonitor.readShared(), BlockGapMonitor.readShared(), BlockGapMonitor.readShared()])

    expect(blockNumberStub.callCount).to.equal(1)
  })

  it('answers with no readings rather than throwing when the measurement fails', async () => {
    blockNumberStub.rejects(new Error('rpc exploded'))
    await seedProgress(900)

    expect(await BlockGapMonitor.readShared()).to.deep.equal([])
  })
})
