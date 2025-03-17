import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { ITokenType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { expect } from 'chai'
import logger from '@logger'
import { FetchRates } from '@rates/fetchRates'

describe.skip('Manual: Token and Rates', () => {
  let sandbox: SinonSandbox

  before(async () => {
    await ProviderModule.connectToAllNetworks()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle native token and it rates', async function () {
    this.timeout(1600000) // Increase timeout for the test

    const address = '0x0000000000000000000000000000000000000000'
    const network = NetworksEnum.ethereumMainnet

    const token = await ProxyToken.saveAndGetToken(address, network)
    expect(token?.address).to.be.equal(address)
    expect(token?.type).to.be.equal(ITokenType.native)
    expect(token?.skipFetchRate).to.be.equal(false)

    const polygonNative = '0x0000000000000000000000000000000000001010'
    const polygonToken = await ProxyToken.saveAndGetToken(polygonNative, NetworksEnum.polygonMainnet)

    expect(polygonToken?.address).to.be.equal(polygonNative)
    expect(polygonToken?.type).to.be.equal(ITokenType.ERC20)
    expect(polygonToken?.skipFetchRate).to.be.equal(false)
  })

  it('should handle normal erc20 token like dai in test and mainnet', async function () {
    this.timeout(1600000) // Increase timeout for the test

    const address = '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357'
    const network = NetworksEnum.ethereumSepolia

    const token = await ProxyToken.saveAndGetToken(address, network)
    expect(token?.address).to.be.equal(address)
    expect(token?.type).to.be.equal(ITokenType.ERC20)
    expect(token?.skipFetchRate).to.be.equal(true)

    const dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    const daiToken = await ProxyToken.saveAndGetToken(dai, NetworksEnum.ethereumMainnet)

    expect(daiToken?.address).to.be.equal(dai)
    expect(daiToken?.type).to.be.equal(ITokenType.ERC20)
    expect(daiToken?.skipFetchRate).to.be.equal(false)
  })

  it('should handle on a case where token is not valid', async function () {
    this.timeout(1600000) // Increase timeout for the test

    const address = '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357'
    const network = NetworksEnum.ethereumMainnet

    const token = await ProxyToken.saveAndGetToken(address, network)
    expect(token?.type).to.be.equal(ITokenType.unknown)
    expect(token?.skipFetchRate).to.be.equal(true)
  })

  describe('rate fetching during six hours', () => {
    it('should handle token rate fetching during six hours', async function () {
      this.timeout(1600000) // Increase timeout for the test

      const tokens = [
        {
          address: '0x0000000000000000000000000000000000000000',
          network: NetworksEnum.ethereumMainnet,
        },
        {
          address: '0x0000000000000000000000000000000000001010',
          network: NetworksEnum.polygonMainnet,
        },
        {
          address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
          network: NetworksEnum.ethereumSepolia,
        },
        {
          address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          network: NetworksEnum.ethereumMainnet,
        },
      ]

      await Promise.all(tokens.map(async token => await ProxyToken.saveAndGetToken(token.address, token.network)))

      await Promise.all(
        tokens.map(async (token: any) => {
          const dbToken = await ProxyToken.saveAndGetToken(token.address, token.network)
          await dbToken?.update({ lastUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
        }),
      )

      const fetchRateSpy = sandbox.spy(FetchRates, 'onMainnetDocument')
      await FetchRates.start()
      expect(fetchRateSpy.callCount).to.be.equal(3)
    })
  })
})
