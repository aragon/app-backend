import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworkHelper } from '@helpers/network'
import Web3Helper from '@helpers/web3'
import { IndexerBlockGapDao } from '@services/aragon-dao/indexerBlockGap'
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

const REPLY_TIMEOUT_MS = 10 * 1000

const freshRequest = () => ({ sentAt: Date.now(), replyTimeoutMs: REPLY_TIMEOUT_MS })

describe('AragonDao: IndexerBlockGapDao', () => {
  let sandbox: SinonSandbox
  let blockNumberStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NETWORK }] as any)
    sandbox.stub(NetworkHelper, 'getAverageBlockTime').returns(BLOCK_TIME)
    blockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(1000)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('reports the gap between the chain head and the last indexed block', async () => {
    // lastSync is the next block to crawl, so block 899 is the last one indexed
    await seedProgress(900)

    const {
      readings: [reading],
    } = await IndexerBlockGapDao.read(freshRequest())

    expect(reading.lastIndexed).to.equal(899)
    expect(reading.chainHead).to.equal(1000)
    expect(reading.lagSeconds).to.equal(101 * BLOCK_TIME)
  })

  it('reports no lag when the indexer has caught up with the chain head', async () => {
    await seedProgress(1001)

    const {
      readings: [reading],
    } = await IndexerBlockGapDao.read(freshRequest())

    expect(reading.lagSeconds).to.equal(0)
  })

  it('leaves out a network the indexer has never synced', async () => {
    expect(await IndexerBlockGapDao.read(freshRequest())).to.deep.equal({ readings: [] })
  })

  it('leaves out a network whose chain head cannot be read', async () => {
    await seedProgress(900)
    blockNumberStub.resolves(-1)

    expect(await IndexerBlockGapDao.read(freshRequest())).to.deep.equal({ readings: [] })
  })

  it('ignores plugin rows so each network reports a single reading', async () => {
    await seedProgress(900)
    await Models.ConfigIndexer.create({
      network: NETWORK,
      service: ConfigIndexerHelper.builders.plugin('multisig' as any, NETWORK, '0xabc'),
      lastSync: 10,
    })

    const { readings } = await IndexerBlockGapDao.read(freshRequest())

    expect(readings).to.have.length(1)
    expect(readings[0].lastIndexed).to.equal(899)
  })

  it('skips the chain reads for a request nobody is waiting on any more', async () => {
    await seedProgress(900)

    const stale = { sentAt: Date.now() - REPLY_TIMEOUT_MS - 1, replyTimeoutMs: REPLY_TIMEOUT_MS }

    expect(await IndexerBlockGapDao.read(stale)).to.deep.equal({ readings: [] })
    expect(blockNumberStub.called).to.be.false
  })
})
