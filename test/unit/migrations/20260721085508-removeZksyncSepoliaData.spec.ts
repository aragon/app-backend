import { Models } from '@dbModels'
import removeZksyncSepoliaDataMigration from '@src/migrations/20260721085508-removeZksyncSepoliaData'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const ZKSYNC_SEPOLIA = 'zksync-sepolia'

describe('migration: remove zksync-sepolia data', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('removes documents on zksync-sepolia across collections while preserving other networks', async () => {
    // Raw inserts bypass schema enum validation, simulating historical docs written
    // before zksync-sepolia was removed from NetworksEnum.
    await Models.Token.collection.insertMany([
      { id: 'token-1', address: '0xaaa', network: ZKSYNC_SEPOLIA },
      { id: 'token-2', address: '0xbbb', network: ZKSYNC_SEPOLIA },
      { id: 'token-3', address: '0xccc', network: NetworksEnum.ethereumMainnet },
    ])

    await Models.Asset.collection.insertMany([
      { id: 'asset-1', network: ZKSYNC_SEPOLIA, daoAddress: '0xdao', tokenAddress: '0xaaa' },
      { id: 'asset-2', network: NetworksEnum.polygonMainnet, daoAddress: '0xdao', tokenAddress: '0xbbb' },
    ])

    await removeZksyncSepoliaDataMigration.start()

    expect(await Models.Token.collection.countDocuments({ network: ZKSYNC_SEPOLIA })).to.equal(0)
    expect(await Models.Asset.collection.countDocuments({ network: ZKSYNC_SEPOLIA })).to.equal(0)

    const remainingTokens = await Models.Token.collection.find().toArray()
    expect(remainingTokens).to.have.lengthOf(1)
    expect(remainingTokens[0].network).to.equal(NetworksEnum.ethereumMainnet)

    const remainingAssets = await Models.Asset.collection.find().toArray()
    expect(remainingAssets).to.have.lengthOf(1)
    expect(remainingAssets[0].network).to.equal(NetworksEnum.polygonMainnet)
  })

  it('completes cleanly when there is no zksync-sepolia data', async () => {
    await Models.Token.collection.insertOne({ id: 'token-1', address: '0xaaa', network: NetworksEnum.ethereumMainnet })

    await removeZksyncSepoliaDataMigration.start()

    expect(await Models.Token.collection.countDocuments()).to.equal(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await removeZksyncSepoliaDataMigration.stop()
      expect(true).to.be.true
    })
  })
})
