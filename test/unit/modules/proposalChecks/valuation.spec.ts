import { Models } from '@dbModels'
import TreasuryValuation from '@modules/proposalChecks/valuation'
import { FakeAsset } from '@test/mock/fakeAsset'
import { FakeToken } from '@test/mock/fakeToken'
import { type ITreasurySnapshot, NetworksEnum } from '@types'
import { expect } from 'chai'

const DAO = '0xDDfa944A93ec63c73dF500d282D0c2De741aD752'
const network = NetworksEnum.polygonMainnet
const DECATS_TOKEN = '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18'
const UNPRICED = '0x1111111111111111111111111111111111111111'
const NATIVE_ALIAS = '0x0000000000000000000000000000000000000000'

const seed = async () => {
  await Models.Token.create({
    ...FakeToken,
    id: `${DECATS_TOKEN}-${network}`,
    address: DECATS_TOKEN,
    decimals: 18,
    priceUsd: '0.5',
    symbol: 'DECATS',
  })
  await Models.Token.create({
    ...FakeToken,
    id: `${UNPRICED}-${network}`,
    address: UNPRICED,
    decimals: 6,
    priceUsd: '0',
    symbol: 'NOPRICE',
  })
  await Models.Token.create({
    ...FakeToken,
    id: `${NATIVE_ALIAS}-${network}`,
    address: NATIVE_ALIAS,
    decimals: 18,
    priceUsd: '0.25',
    symbol: 'POL',
    type: 'native',
  })
  await Models.Asset.create({
    ...FakeAsset,
    id: `${DAO}-${DECATS_TOKEN}-${network}`,
    daoAddress: DAO,
    tokenAddress: DECATS_TOKEN,
    amount: '10000',
    amountUsd: '5000',
  })
  await Models.Asset.create({
    ...FakeAsset,
    id: `${DAO}-${UNPRICED}-${network}`,
    daoAddress: DAO,
    tokenAddress: UNPRICED,
    amount: '42',
    amountUsd: '0',
  })
  await Models.Asset.create({
    ...FakeAsset,
    id: `${DAO}-${NATIVE_ALIAS}-${network}`,
    daoAddress: DAO,
    tokenAddress: NATIVE_ALIAS,
    amount: '8',
    amountUsd: '2',
  })
}

describe('proposalChecks/valuation', () => {
  it('loads the indexed holdings with prices, keys the native coin as native, and leaves an unpriced holding unpriced', async () => {
    await seed()

    const snapshot = await TreasuryValuation.load(DAO, network)

    expect(snapshot.pricedAt).to.be.greaterThan(1_700_000_000)
    expect(snapshot.assets[DECATS_TOKEN.toLowerCase()]).to.deep.eq({
      balance: '10000',
      decimals: 18,
      priceUsd: '0.5',
    })
    expect(snapshot.assets[UNPRICED.toLowerCase()]).to.deep.eq({
      balance: '42',
      decimals: 6,
      priceUsd: null,
    })
    expect(snapshot.assets.native).to.deep.eq({ balance: '8', decimals: 18, priceUsd: '0.25' })
    expect(snapshot.totalUsd).to.eq('5002')
  })

  it('values a raw amount exactly in dollars and as a share of the whole priced treasury', () => {
    const treasury: ITreasurySnapshot = {
      pricedAt: 1,
      totalUsd: '6845',
      assets: { [DECATS_TOKEN.toLowerCase()]: { balance: '10000', decimals: 18, priceUsd: '0.5' } },
    }

    const valuation = TreasuryValuation.value(DECATS_TOKEN, '1369000000000000000000', treasury)

    expect(valuation).to.deep.eq({ usd: '684.5', treasuryShare: '0.1', pricedAt: 1 })
  })

  it('gives null, never zero, for an unpriced token, an unknown asset, or a treasury with no priced total', () => {
    const treasury: ITreasurySnapshot = {
      pricedAt: 1,
      totalUsd: null,
      assets: {
        [UNPRICED.toLowerCase()]: { balance: '42', decimals: 6, priceUsd: null },
        native: { balance: '0', decimals: 18, priceUsd: '0.25' },
      },
    }

    expect(TreasuryValuation.value(UNPRICED, '21000000', treasury)).to.deep.eq({
      usd: null,
      treasuryShare: null,
      pricedAt: 1,
    })
    expect(TreasuryValuation.value('0x9999999999999999999999999999999999999999', '1', treasury)).to.deep.eq({
      usd: null,
      treasuryShare: null,
      pricedAt: 1,
    })
    expect(TreasuryValuation.value('native', '1000000000000000000', treasury)).to.deep.eq({
      usd: '0.25',
      treasuryShare: null,
      pricedAt: 1,
    })
  })
})
