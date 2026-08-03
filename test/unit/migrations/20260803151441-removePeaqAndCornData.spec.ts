import { Models } from '@dbModels'
import removePeaqAndCornDataMigration from '@src/migrations/20260803151441-removePeaqAndCornData'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PEAQ_MAINNET = 'peaq-mainnet'
const CORN_MAINNET = 'corn-mainnet'

describe('migration: remove peaq and corn data', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('removes documents on the deprecated networks across collections while preserving other networks', async () => {
    await Models.Token.collection.insertMany([
      { id: 'token-1', address: '0xaaa', network: PEAQ_MAINNET },
      { id: 'token-2', address: '0xbbb', network: CORN_MAINNET },
      { id: 'token-3', address: '0xccc', network: NetworksEnum.ethereumMainnet },
    ])

    await Models.Asset.collection.insertMany([
      { id: 'asset-1', network: PEAQ_MAINNET, daoAddress: '0xdao', tokenAddress: '0xaaa' },
      { id: 'asset-2', network: CORN_MAINNET, daoAddress: '0xdao', tokenAddress: '0xbbb' },
      { id: 'asset-3', network: NetworksEnum.polygonMainnet, daoAddress: '0xdao', tokenAddress: '0xccc' },
    ])

    await Models.Dao.collection.insertMany([
      { id: 'dao-1', address: '0xdao', network: PEAQ_MAINNET },
      { id: 'dao-2', address: '0xdao2', network: CORN_MAINNET },
      { id: 'dao-3', address: '0xdao3', network: NetworksEnum.ethereumMainnet },
    ])

    await removePeaqAndCornDataMigration.start()

    for (const network of [PEAQ_MAINNET, CORN_MAINNET]) {
      expect(await Models.Token.collection.countDocuments({ network })).to.equal(0)
      expect(await Models.Asset.collection.countDocuments({ network })).to.equal(0)
      expect(await Models.Dao.collection.countDocuments({ network })).to.equal(0)
    }

    const remainingTokens = await Models.Token.collection.find().toArray()
    expect(remainingTokens).to.have.lengthOf(1)
    expect(remainingTokens[0].network).to.equal(NetworksEnum.ethereumMainnet)

    const remainingAssets = await Models.Asset.collection.find().toArray()
    expect(remainingAssets).to.have.lengthOf(1)
    expect(remainingAssets[0].network).to.equal(NetworksEnum.polygonMainnet)

    const remainingDaos = await Models.Dao.collection.find().toArray()
    expect(remainingDaos).to.have.lengthOf(1)
    expect(remainingDaos[0].network).to.equal(NetworksEnum.ethereumMainnet)
  })

  it('completes cleanly when there is no deprecated network data', async () => {
    await Models.Token.collection.insertOne({ id: 'token-1', address: '0xaaa', network: NetworksEnum.ethereumMainnet })

    await removePeaqAndCornDataMigration.start()

    expect(await Models.Token.collection.countDocuments()).to.equal(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await removePeaqAndCornDataMigration.stop()
      expect(true).to.be.true
    })
  })
})
