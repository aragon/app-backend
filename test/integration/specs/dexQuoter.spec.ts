/**
 * Integration test for `DexQuoterModule.getRateInNative` against the live
 * Citrea mainnet JuiceSwap V3 quoter.
 *
 * Required env:
 *   - CITREA_TEST_TOKEN_ADDRESS=<0x… an ERC-20 with a JuiceSwap V3 pool
 *       against the configured wrappedNative (WcBTC, 0xDF240DC0…)>
 *   - one of: NODES_CITREA_MAINNET_ARAGON_RPC | NODES_CITREA_MAINNET_DRPC_API_KEY
 *       | NODES_CITREA_MAINNET_ALCHEMY_API_KEY
 *
 * The suite runtime-skips when either piece of config is missing so a local
 * `yarn test:integration` run never fails loudly on env. Assertions are
 * volatility-resistant — only that the call returned a positive bigint, not
 * an exact price.
 */
import config from '@config'
import DexQuoterModule from '@modules/dexQuoter'
import ProviderModule from '@modules/provider'
import { type HexAddress, IProviderType, NetworksEnum } from '@types'
import { expect } from 'chai'

const NETWORK = NetworksEnum.citreaMainnet
const EXPECTED_WRAPPED_NATIVE = '0xDF240DC08B0FdaD1d93b74d5048871232f6BEA3d'

const CITREA_TOKEN = (process.env.CITREA_TEST_TOKEN_ADDRESS || '') as HexAddress

function citreaRpcConfigured(): boolean {
  const node = config.NODES?.CITREA_MAINNET
  return Boolean(node?.ARAGON_RPC || node?.DRPC_API_KEY || node?.ALCHEMY_API_KEY)
}

async function ensureCitreaProvider(): Promise<void> {
  // If something already populated the proxy (e.g. another suite called
  // connectToAllNetworks), reuse it; otherwise wire from config so we hit
  // the real RPC without depending on the global service bootstrap.
  if (ProviderModule.getAnyRpcProvider(NETWORK)) return

  const node = config.NODES?.CITREA_MAINNET
  if (!node) return

  if (node.ARAGON_RPC) {
    await ProviderModule.connectToNetwork(NETWORK, {
      providerType: IProviderType.ARAGON,
      rpcEndpoint: node.ARAGON_RPC,
      fromBlock: node.FROM_BLOCK,
      confirmationBlocks: node.CONFIRMATION_BLOCKS,
      intervalBlockTime: node.INTERVAL_BLOCK_TIME,
    })
    return
  }

  if (node.DRPC_API_KEY) {
    await ProviderModule.connectToNetwork(NETWORK, {
      providerType: IProviderType.DRPC,
      drpcApiKey: node.DRPC_API_KEY,
      fromBlock: node.FROM_BLOCK,
      confirmationBlocks: node.CONFIRMATION_BLOCKS,
      intervalBlockTime: node.INTERVAL_BLOCK_TIME,
    })
    return
  }

  if (node.ALCHEMY_API_KEY) {
    await ProviderModule.connectToNetwork(NETWORK, {
      providerType: IProviderType.ALCHEMY,
      alchemyApiKey: node.ALCHEMY_API_KEY,
      fromBlock: node.FROM_BLOCK,
      confirmationBlocks: node.CONFIRMATION_BLOCKS,
      intervalBlockTime: node.INTERVAL_BLOCK_TIME,
    })
  }
}

describe('Module: dexQuoter — Citrea mainnet (live RPC)', function () {
  this.timeout(300_000)
  this.slow(0)

  before(async function () {
    if (!CITREA_TOKEN) {
      // eslint-disable-next-line no-console
      console.warn('[dexQuoter integration] CITREA_TEST_TOKEN_ADDRESS env var not set — skipping suite.')
      this.skip()
    }
    if (!citreaRpcConfigured()) {
      // eslint-disable-next-line no-console
      console.warn(
        '[dexQuoter integration] No Citrea RPC env var set ' +
          '(NODES_CITREA_MAINNET_ARAGON_RPC / DRPC_API_KEY / ALCHEMY_API_KEY) — skipping suite.',
      )
      this.skip()
    }
    await ensureCitreaProvider()
    if (!ProviderModule.getAnyRpcProvider(NETWORK)) {
      // eslint-disable-next-line no-console
      console.warn('[dexQuoter integration] Failed to instantiate Citrea provider — skipping suite.')
      this.skip()
    }
  })

  it('getRateInNative returns a positive quote denominated in wrappedNative', async () => {
    const result = await DexQuoterModule.getRateInNative({
      network: NETWORK,
      tokenAddress: CITREA_TOKEN,
    })

    expect(result, 'getRateInNative returned null — token may have no JuiceSwap V3 pool').to.not.be.null
    expect(result!.amountOut > 0n, `expected amountOut > 0, got ${result!.amountOut.toString()}`).to.be.true
    expect(result!.dex).to.equal('juiceswap')
    expect(result!.wrappedNative.toLowerCase()).to.equal(EXPECTED_WRAPPED_NATIVE.toLowerCase())
    expect(result!.tokenDecimals, 'tokenDecimals must be a positive number').to.be.a('number').and.greaterThan(0)
  })
})
