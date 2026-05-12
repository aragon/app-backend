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

async function readErc20Decimals(network: NetworksEnum, tokenAddress: HexAddress): Promise<number> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(tokenAddress, ERC20.abi, provider)
  const raw = await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.decimals())
  return Number(raw)
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
  const quoter = new Contract(dex.quoter, UniswapV3QuoterV2.abi, provider)

  let best: bigint | null = null
  for (const fee of dex.feeTiers) {
    try {
      // QuoterV2 mutates state and reverts at the end with the quote — call statically.
      const result = await BottleneckModule.getNodeLimiter(network).schedule(async () =>
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
  const router = new Contract(dex.router, UniswapV2Router.abi, provider)

  try {
    const amounts = await BottleneckModule.getNodeLimiter(network).schedule(async () =>
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

    const amountIn = params.amountIn ?? 10n ** BigInt(await readErc20Decimals(network, tokenIn))

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
   * unit of the input token. The wrapped-native address comes from the first
   * configured DEX entry — all DEXs on a network must share the same wrapper.
   */
  async getRateInNative(params: IGetRateInNativeParams): Promise<IRateInNativeQuote | null> {
    const { network, tokenAddress } = params
    const dexes = config.DEX_QUOTERS[network]
    if (!dexes?.length) {
      return null
    }
    const { wrappedNative } = dexes[0]

    const tokenDecimals = await readErc20Decimals(network, tokenAddress)
    const amountIn = 10n ** BigInt(tokenDecimals)

    const quote = await DexQuoterModule.getQuote({ network, tokenIn: tokenAddress, tokenOut: wrappedNative, amountIn })
    if (!quote) {
      return null
    }

    return { ...quote, tokenDecimals, wrappedNative }
  },
}

export default DexQuoterModule
