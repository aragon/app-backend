import { Models } from '@dbModels'
import rmDuplicateAssetsPeaqMigration from '@src/migrations/20260112152600-rm-duplicate-assets-peaq'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: rm duplicate assets', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('remove duplicate ERC20 assets for native token on Peaq network', async () => {
    await Models.Asset.create({
      id: '0xaBdef33Cd99c1a119aEfFa4dD0d1f47e3293a146-0x0000000000000000000000000000000000000809-peaq-mainnet',
      network: NetworksEnum.peaqMainnet,
      daoAddress: '0xaBdef33Cd99c1a119aEfFa4dD0d1f47e3293a146',
      tokenAddress: '0x0000000000000000000000000000000000000809',
      amount: '0.10323',
      amountUsd: 0,
    })

    await Models.Asset.create({
      id: '0xaBdef33Cd99c1a119aEfFa4dD0d1f47e3293a146-0x0000000000000000000000000000000000000000-peaq-mainnet',
      network: NetworksEnum.peaqMainnet,
      daoAddress: '0xaBdef33Cd99c1a119aEfFa4dD0d1f47e3293a146',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      amount: '0.10323',
      amountUsd: 0.01,
    })

    const assetsBefore = await Models.Asset.find()
    expect(assetsBefore).to.have.lengthOf(2)

    await rmDuplicateAssetsPeaqMigration.start()

    const assetsAfter = await Models.Asset.find()
    expect(assetsAfter).to.have.lengthOf(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await rmDuplicateAssetsPeaqMigration.stop()
      expect(true).to.be.true
    })
  })
})
