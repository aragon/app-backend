import { ERC20 } from '@artifacts/ERC20'
import { UniswapV2Router } from '@artifacts/UniswapV2Router'
import { UniswapV3QuoterV2 } from '@artifacts/UniswapV3QuoterV2'
import config from '@config'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type IDexQuoterConfig, type NetworksEnum } from '@types'
import { Contract } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'dex-quoter' })

export interface IGetQuoteParams {
  network: NetworksEnum
  tokenIn: HexAddress
  tokenOut: HexAddress
  /** Defaults to one whole input token (10 ** decimals(tokenIn)). */
  amountIn?: bigint
}

export interface IGetRateInNativeParams {
  network: NetworksEnum
  tokenAddress: HexAddress
}

export interface IDexQuote {
  /** Amount of `tokenOut` (in its smallest unit) returned for `amountIn` of `tokenIn`. */
  amountOut: bigint
  /** Original `amountIn` echoed back so the caller can compute a unit price without recomputing it. */
  amountIn: bigint
  /** Identifier of the DEX that produced the quote (matches `IDexQuoterConfig.name`). */
  dex: string
}

export interface IRateInNativeQuote extends IDexQuote {
  tokenDecimals: number
  /** Address of the wrapped-native token used as the quote denominator. */
  wrappedNative: HexAddress
}

async function readErc20Decimals(network: NetworksEnum, tokenAddress: HexAddress): Promise<number | null> {
  try {
    const provider = ProviderModule.getAnyRpcProvider(network)
    if (!provider) return null
    const contract = new Contract(tokenAddress, ERC20.abi, provider)
    const raw = await BottleneckModule.getDexQuoterLimiter(network).schedule(async () => contract.decimals())
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 0 || value > 36) return null
    return value
  } catch (error) {
    logger.warn('Failed to read ERC20 decimals', llo({ network, tokenAddress, error }))
    return null
  }
}

async function quoteV3(
  network: NetworksEnum,
  dex: IDexQuoterConfig,
  tokenIn: HexAddress,
  tokenOut: HexAddress,
  amountIn: bigint,
): Promise<bigint | null> {
  if (!dex.quoter || !dex.feeTiers?.length) {
    return null
  }

  const provider = ProviderModule.getAnyRpcProvider(network)
  if (!provider) return null

  let quoter: Contract
  try {
    quoter = new Contract(dex.quoter, UniswapV3QuoterV2.abi, provider)
  } catch (error) {
    logger.warn('Failed to construct V3 quoter', llo({ network, dex: dex.name, error }))
    return null
  }

  let best: bigint | null = null
  for (const fee of dex.feeTiers) {
    try {
      // QuoterV2 mutates state and reverts at the end with the quote — call statically.
      const result = await BottleneckModule.getDexQuoterLimiter(network).schedule(async () =>
        quoter.quoteExactInputSingle.staticCall({
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }),
      )
      const out = BigInt(result.amountOut ?? result[0])
      if (out > 0n && (best === null || out > best)) {
        best = out
      }
    } catch {
      // Fee tier has no pool / no liquidity — try the next.
    }
  }

  return best
}

async function quoteV2(
  network: NetworksEnum,
  dex: IDexQuoterConfig,
  tokenIn: HexAddress,
  tokenOut: HexAddress,
  amountIn: bigint,
): Promise<bigint | null> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  if (!provider) return null

  try {
    const router = new Contract(dex.router, UniswapV2Router.abi, provider)
    const amounts = await BottleneckModule.getDexQuoterLimiter(network).schedule(async () =>
      router.getAmountsOut(amountIn, [tokenIn, tokenOut]),
    )
    const out = BigInt(amounts[amounts.length - 1])
    return out > 0n ? out : null
  } catch {
    return null
  }
}

const DexQuoterModule = {
  /**
   * Returns the indicative output amount for swapping `amountIn` of `tokenIn`
   * for `tokenOut` on the given network, probing every configured DEX in
   * order. Resolves to `null` when no configured DEX has a route.
   */
  async getQuote(params: IGetQuoteParams): Promise<IDexQuote | null> {
    const { network, tokenIn, tokenOut } = params
    const dexes = config.DEX_QUOTERS[network]
    if (!dexes?.length) {
      return null
    }

    let amountIn = params.amountIn
    if (amountIn === undefined) {
      const decimals = await readErc20Decimals(network, tokenIn)
      if (decimals === null) {
        logger.warn('Cannot derive default amountIn — unable to read tokenIn decimals', llo({ network, tokenIn }))
        return null
      }
      amountIn = 10n ** BigInt(decimals)
    }

    for (const dex of dexes) {
      const out =
        dex.kind === 'uniswapV3'
          ? await quoteV3(network, dex, tokenIn, tokenOut, amountIn)
          : await quoteV2(network, dex, tokenIn, tokenOut, amountIn)
      if (out !== null) {
        logger.info('Quote resolved', llo({ network, tokenIn, tokenOut, dex: dex.name, amountOut: out.toString() }))
        return { amountOut: out, amountIn, dex: dex.name }
      }
    }

    logger.warn('No DEX produced a quote', llo({ network, tokenIn, tokenOut }))
    return null
  },

  /**
   * Returns the indicative price of `tokenAddress` denominated in the chain's
   * wrapped-native token (e.g. WBTC on Citrea, WETH on Ethereum) for one whole
   * unit of the input token. The wrapped-native address is taken from the
   * first configured DEX entry; DEXs that declare a different `wrappedNative`
   * are ignored with a warning so a misconfigured entry can't silently quote
   * against the wrong denominator.
   */
  async getRateInNative(params: IGetRateInNativeParams): Promise<IRateInNativeQuote | null> {
    const { network, tokenAddress } = params
    const dexes = config.DEX_QUOTERS[network]
    if (!dexes?.length) {
      return null
    }
    const { wrappedNative } = dexes[0]
    const mismatched = dexes.filter(d => d.wrappedNative.toLowerCase() !== wrappedNative.toLowerCase())
    if (mismatched.length) {
      logger.warn(
        'Ignoring DEX entries with mismatched wrappedNative',
        llo({
          network,
          expected: wrappedNative,
          mismatched: mismatched.map(d => ({ name: d.name, wrappedNative: d.wrappedNative })),
        }),
      )
    }

    const tokenDecimals = await readErc20Decimals(network, tokenAddress)
    if (tokenDecimals === null) {
      return null
    }
    const amountIn = 10n ** BigInt(tokenDecimals)

    const quote = await DexQuoterModule.getQuote({ network, tokenIn: tokenAddress, tokenOut: wrappedNative, amountIn })
    if (!quote) {
      return null
    }

    return { ...quote, tokenDecimals, wrappedNative }
  },
}

export default DexQuoterModule
