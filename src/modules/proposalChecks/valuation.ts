import { Models } from '@dbModels'
import type Token from '@models/schema/token'
import {
  type HexAddress,
  type ITreasuryAsset,
  type ITreasurySnapshot,
  type IValuation,
  type NetworksEnum,
} from '@types'
import BigNumber from 'bignumber.js'

const exact = BigNumber.clone({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN })

/**
 * Values requested amounts against the DAO's indexed holdings. Prices are the rates service's
 * current ones, so a snapshot records when it was priced; the amount stays exact in the token's
 * base unit and only the dollar figure is approximate. The share is of the whole priced
 * treasury, not of the one holding. A missing price or total gives null, never zero: an
 * unpriced transfer is still a transfer.
 */
const TreasuryValuation = {
  async load(daoAddress: HexAddress, network: NetworksEnum): Promise<ITreasurySnapshot> {
    const assets: Record<string, ITreasuryAsset> = {}
    let totalUsd = new exact(0)
    const rows = await Models.Asset.find({ daoAddress, network }, { tokenAddress: 1, amount: 1 })
    const addresses: HexAddress[] = rows.map(row => row.tokenAddress)
    const tokens = (await Models.Token.find(
      { address: { $in: addresses }, network },
      { address: 1, decimals: 1, priceUsd: 1, type: 1 },
    ).lean()) as Array<Pick<Token, 'address' | 'decimals' | 'priceUsd' | 'type'>>
    const byAddress = new Map(tokens.map(token => [String(token.address), token] as const))
    for (const row of rows) {
      const token = byAddress.get(String(row.tokenAddress))
      if (!token) continue
      const key = token.type === 'native' ? 'native' : String(row.tokenAddress)
      const priceUsd = token.priceUsd && token.priceUsd !== '0' ? token.priceUsd : null
      assets[key] = { balance: String(row.amount ?? '0'), decimals: token.decimals ?? 18, priceUsd }
      if (priceUsd) totalUsd = totalUsd.plus(new exact(assets[key].balance).times(priceUsd))
    }
    return { pricedAt: Math.floor(Date.now() / 1000), totalUsd: totalUsd.gt(0) ? totalUsd.toFixed() : null, assets }
  },

  /** `rawAmount` is in the token's base unit; the holding's balance is in whole units, as indexed. */
  value(asset: string, rawAmount: string, treasury: ITreasurySnapshot): IValuation {
    const holding = treasury.assets[asset]
    if (!holding?.priceUsd) return { usd: null, treasuryShare: null, pricedAt: treasury.pricedAt }

    const usd = new exact(rawAmount || '0').shiftedBy(-holding.decimals).times(holding.priceUsd)
    return {
      usd: usd.toFixed(),
      treasuryShare: treasury.totalUsd ? usd.div(treasury.totalUsd).toFixed() : null,
      pricedAt: treasury.pricedAt,
    }
  },
}

export default TreasuryValuation
