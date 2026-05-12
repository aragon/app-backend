import config from '@config'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStub } from 'sinon'

describe('Module: dexQuoter', () => {
  let sandbox: SinonSandbox
  let DexQuoterModule: any
  let contractFactory: SinonStub
  let scheduleStub: SinonStub

  const network = NetworksEnum.citreaMainnet
  const tokenIn = '0x1111111111111111111111111111111111111111' as HexAddress
  const tokenOut = '0x2222222222222222222222222222222222222222' as HexAddress
  const wrappedNative = '0x3333333333333333333333333333333333333333' as HexAddress

  const v3Dex = (overrides: Partial<any> = {}) => ({
    name: 'satsumaV3',
    kind: 'uniswapV3' as const,
    router: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as HexAddress,
    quoter: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as HexAddress,
    wrappedNative,
    feeTiers: [500, 3000, 10000],
    ...overrides,
  })

  const v2Dex = (overrides: Partial<any> = {}) => ({
    name: 'satsumaV2',
    kind: 'uniswapV2' as const,
    router: '0xcccccccccccccccccccccccccccccccccccccccc' as HexAddress,
    wrappedNative,
    ...overrides,
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    // Silence info / warn logs emitted by the module so test output stays clean.
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({} as any)
    scheduleStub = sandbox.stub().callsFake(async (fn: () => Promise<any>) => fn())
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: scheduleStub } as any)

    // Per-test factory stub: each `new Contract(address, abi, provider)` invocation
    // pulls the next pre-queued fake from `contractFactory`.
    contractFactory = sandbox.stub()

    // Re-require the module through proxyquire so `ethers.Contract` is our fake.
    DexQuoterModule = proxyquire.noCallThru()('@modules/dexQuoter', {
      ethers: {
        Contract: function (address: string, _abi: unknown, _provider: unknown) {
          return contractFactory(address)
        },
      },
    }).default
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getQuote', () => {
    it('returns null when no DEX is configured for the network', async () => {
      sandbox.stub(config, 'DEX_QUOTERS').value({})

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
      expect(contractFactory.called).to.be.false
    })

    it('uses uniswapV3 happy path returning the quote from the first fee tier', async () => {
      const dex = v3Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v3Quoter = {
        quoteExactInputSingle: {
          staticCall: sandbox.stub(),
        },
      }
      // First call resolves the input ERC20 (decimals); subsequent calls resolve the quoter.
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v3Quoter)

      v3Quoter.quoteExactInputSingle.staticCall.onCall(0).resolves({ amountOut: 5_000n })
      v3Quoter.quoteExactInputSingle.staticCall.onCall(1).rejects(new Error('no pool'))
      v3Quoter.quoteExactInputSingle.staticCall.onCall(2).rejects(new Error('no pool'))

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.deep.equal({ amountOut: 5_000n, amountIn: 10n ** 18n, dex: dex.name })
      // ERC20 decimals + V3 quoter contract = 2 instances.
      expect(contractFactory.callCount).to.equal(2)
    })

    it('iterates V3 fee tiers and picks the highest amountOut across multiple successful tiers', async () => {
      const dex = v3Dex({ feeTiers: [100, 500, 3000] })
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(6n) }
      const v3Quoter = {
        quoteExactInputSingle: {
          staticCall: sandbox.stub(),
        },
      }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v3Quoter)

      // Tier 0 reverts, tier 1 returns 1_000 (positional encoding via array form),
      // tier 2 returns 2_500 (the higher value -> should win).
      v3Quoter.quoteExactInputSingle.staticCall.onCall(0).rejects(new Error('no pool'))
      v3Quoter.quoteExactInputSingle.staticCall.onCall(1).resolves([1_000n])
      v3Quoter.quoteExactInputSingle.staticCall.onCall(2).resolves({ amountOut: 2_500n })

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.deep.equal({ amountOut: 2_500n, amountIn: 10n ** 6n, dex: dex.name })
    })

    it('returns null and ignores zero quotes when every V3 tier reverts or returns 0', async () => {
      const dex = v3Dex({ feeTiers: [500] })
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v3Quoter = {
        quoteExactInputSingle: {
          staticCall: sandbox.stub().resolves({ amountOut: 0n }),
        },
      }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v3Quoter)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })

    it('skips a V3 dex with no quoter, falling through to the next configured dex (V2 here)', async () => {
      const v3 = v3Dex({ quoter: undefined })
      const v2 = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [v3, v2] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v2Router = { getAmountsOut: sandbox.stub().resolves([10n ** 18n, 7_777n]) }
      contractFactory.onCall(0).returns(erc20)
      // No contract is built for the V3 dex (early return in quoteV3) — next call is the V2 router.
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.deep.equal({ amountOut: 7_777n, amountIn: 10n ** 18n, dex: v2.name })
    })

    it('returns null when V3 dex has no feeTiers and no other dex is configured', async () => {
      const dex = v3Dex({ feeTiers: undefined })
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      contractFactory.onCall(0).returns(erc20)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })

    it('uses uniswapV2 happy path via getAmountsOut', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v2Router = { getAmountsOut: sandbox.stub().resolves([10n ** 18n, 42n]) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.deep.equal({ amountOut: 42n, amountIn: 10n ** 18n, dex: dex.name })
      expect(v2Router.getAmountsOut.calledOnce).to.be.true
      expect(v2Router.getAmountsOut.firstCall.args[1]).to.deep.equal([tokenIn, tokenOut])
    })

    it('returns null when V2 getAmountsOut throws', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v2Router = { getAmountsOut: sandbox.stub().rejects(new Error('no path')) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })

    it('returns null when V2 getAmountsOut returns a non-positive amount', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v2Router = { getAmountsOut: sandbox.stub().resolves([10n ** 18n, 0n]) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })

    it('returns null when every configured DEX fails', async () => {
      const v3 = v3Dex({ feeTiers: [500] })
      const v2 = v2Dex({ name: 'fallbackV2' })
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [v3, v2] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v3Quoter = {
        quoteExactInputSingle: {
          staticCall: sandbox.stub().rejects(new Error('no pool')),
        },
      }
      const v2Router = { getAmountsOut: sandbox.stub().rejects(new Error('no path')) }

      contractFactory.onCall(0).returns(erc20)
      contractFactory.onCall(1).returns(v3Quoter)
      contractFactory.onCall(2).returns(v2Router)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })

    it('passes through caller-provided amountIn without resolving ERC20 decimals', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const v2Router = { getAmountsOut: sandbox.stub().resolves([123n, 999n]) }
      // First call is the V2 router — decimals path is never taken.
      contractFactory.returns(v2Router)

      const customAmountIn = 123n
      const result = await DexQuoterModule.getQuote({
        network,
        tokenIn,
        tokenOut,
        amountIn: customAmountIn,
      })

      expect(result).to.deep.equal({ amountOut: 999n, amountIn: customAmountIn, dex: dex.name })
      expect(v2Router.getAmountsOut.firstCall.args[0]).to.equal(customAmountIn)
      // Only the router contract should have been instantiated (no ERC20 decimals lookup).
      expect(contractFactory.callCount).to.equal(1)
    })
  })

  describe('getRateInNative', () => {
    it('returns null when no DEX is configured (decimals is never read)', async () => {
      sandbox.stub(config, 'DEX_QUOTERS').value({})

      const result = await DexQuoterModule.getRateInNative({ network, tokenAddress: tokenIn })

      expect(result).to.be.null
      expect(contractFactory.called).to.be.false
    })

    it('returns the wrapped-native quote with tokenDecimals on the happy path', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const v2Router = { getAmountsOut: sandbox.stub().resolves([10n ** 18n, 4_321n]) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getRateInNative({ network, tokenAddress: tokenIn })

      expect(result).to.deep.equal({
        amountOut: 4_321n,
        amountIn: 10n ** 18n,
        dex: dex.name,
        tokenDecimals: 18,
        wrappedNative,
      })
      // The inner getQuote should have been invoked with tokenOut === wrappedNative.
      expect(v2Router.getAmountsOut.firstCall.args[1]).to.deep.equal([tokenIn, wrappedNative])
    })

    it('returns null when the inner getQuote produces no quote', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      const erc20 = { decimals: sandbox.stub().resolves(8n) }
      const v2Router = { getAmountsOut: sandbox.stub().rejects(new Error('no path')) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(v2Router)

      const result = await DexQuoterModule.getRateInNative({ network, tokenAddress: tokenIn })

      expect(result).to.be.null
    })

    it('returns null when readErc20Decimals fails (no provider)', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      // Make the provider missing — readErc20Decimals must return null and getRateInNative must bail.
      ;(ProviderModule.getAnyRpcProvider as SinonStub).returns(undefined)

      const result = await DexQuoterModule.getRateInNative({ network, tokenAddress: tokenIn })

      expect(result).to.be.null
      expect(contractFactory.called).to.be.false
    })

    it('warns and continues when a DEX entry declares a mismatched wrappedNative', async () => {
      const primary = v2Dex({ name: 'primary' })
      const mismatched = v2Dex({
        name: 'mismatched',
        wrappedNative: '0x9999999999999999999999999999999999999999' as HexAddress,
      })
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [primary, mismatched] })

      const erc20 = { decimals: sandbox.stub().resolves(18n) }
      const primaryRouter = { getAmountsOut: sandbox.stub().resolves([10n ** 18n, 555n]) }
      contractFactory.onCall(0).returns(erc20)
      contractFactory.returns(primaryRouter)

      const result = await DexQuoterModule.getRateInNative({ network, tokenAddress: tokenIn })

      expect((logger.warn as SinonStub).calledWith('Ignoring DEX entries with mismatched wrappedNative')).to.be.true
      expect(result).to.deep.equal({
        amountOut: 555n,
        amountIn: 10n ** 18n,
        dex: 'primary',
        tokenDecimals: 18,
        wrappedNative,
      })
    })
  })

  describe('resilience', () => {
    it('getQuote returns null when ProviderModule has no provider for the network', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      ;(ProviderModule.getAnyRpcProvider as SinonStub).returns(undefined)

      const result = await DexQuoterModule.getQuote({
        network,
        tokenIn,
        tokenOut,
        amountIn: 1n,
      })

      expect(result).to.be.null
      expect(contractFactory.called).to.be.false
    })

    it('getQuote returns null when default amountIn cannot be derived (decimals call throws)', async () => {
      const dex = v2Dex()
      sandbox.stub(config, 'DEX_QUOTERS').value({ [network]: [dex] })

      // ERC20.decimals() throws → readErc20Decimals returns null → getQuote bails.
      const erc20 = { decimals: sandbox.stub().rejects(new Error('not an ERC20')) }
      contractFactory.returns(erc20)

      const result = await DexQuoterModule.getQuote({ network, tokenIn, tokenOut })

      expect(result).to.be.null
    })
  })
})
