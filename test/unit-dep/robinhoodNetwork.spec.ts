import config from '@config'
import CoinGeckoHelper from '@helpers/coinGecko'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import MongoDB from '@modules/mongo'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integration: Robinhood mainnet (Blockscout)', () => {
  let dropStub: sinon.SinonStub

  const LINK_TOKEN = '0x492641F648a4986844848E0beFE66D14817bCE34'

  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  describe('fetchContractSourceCode (Blockscout PRO)', () => {
    it('returns verified source for the LINK ERC-20 contract via the multichain API', async function () {
      this.timeout(30_000)
      if (!config.BLOCKSCOUT_PRO_API.API_KEY) {
        console.warn('BLOCKSCOUT_PRO_API_KEY not set — skipping Blockscout PRO check')
        this.skip()
      }

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT_PRO,
        LINK_TOKEN,
        NetworksEnum.robinhoodMainnet,
      )

      expect(result, 'source code result must not be null').to.not.be.null
      expect(result![0]).to.have.property('ContractName').that.is.a('string').and.not.empty
    })
  })

  describe('getBlockByTimestamp (Blockscout)', () => {
    it('resolves a block number for a recent timestamp', async function () {
      this.timeout(30_000)

      const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3
      const block = await evmExplorerClient.getBlockByTimestamp(
        EvmExplorerEnum.BLOCKSCOUT,
        timestamp,
        NetworksEnum.robinhoodMainnet,
        'before',
      )

      expect(block, 'block number must be a positive integer').to.be.a('number').and.greaterThan(0)
    })
  })

  describe('Web3Provider.fetchContractSourceCode (network routing)', () => {
    it('routes robinhood-mainnet to Blockscout and returns verified source', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractSourceCode({
        address: LINK_TOKEN,
        network: NetworksEnum.robinhoodMainnet,
      })

      expect(result, 'Web3Provider must return verified source on robinhood').to.not.be.null
      expect(result).to.be.an('array').with.length.greaterThan(0)
      expect(result![0]).to.have.property('ContractName').that.is.not.empty
    })
  })

  describe('Web3Provider.fetchContractCreation (network routing)', () => {
    it('routes robinhood-mainnet to Blockscout and returns creation tx', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractCreation({
        address: LINK_TOKEN,
        network: NetworksEnum.robinhoodMainnet,
      })

      expect(result.transactionHash, 'creation tx hash must be populated').to.match(/^0x[a-fA-F0-9]{64}$/)
    })
  })

  describe('CoinGecko price fetching', () => {
    it('returns native ETH price for robinhood-mainnet (nativeTokenId=ethereum)', async function () {
      this.timeout(30_000)

      const native = await CoinGeckoHelper.getNativeToken(NetworksEnum.robinhoodMainnet)

      expect(native, 'native token must resolve on robinhood (ethereum coin id)').to.not.equal(false)
      const token = native as Exclude<typeof native, false>
      expect(token.type).to.equal(ITokenType.native)
      expect(token.symbol?.toLowerCase()).to.equal('eth')
      expect(Number(token.priceUsd), 'native ETH priceUsd must be positive').to.be.greaterThan(0)
    })

    it('returns ERC-20 token data for the LINK token (networkId=robinhood)', async function () {
      this.timeout(30_000)

      const token = await CoinGeckoHelper.getToken(LINK_TOKEN, NetworksEnum.robinhoodMainnet)

      if (token === false) {
        console.warn(`CoinGecko has not indexed ${LINK_TOKEN} on network "robinhood" yet — skipping price assertion`)
        this.skip()
      } else {
        expect(token.type).to.equal(ITokenType.ERC20)
        expect(token.symbol).to.be.a('string').and.not.empty
        expect(token.decimals).to.equal(18)
        expect(token.address.toLowerCase()).to.equal(LINK_TOKEN.toLowerCase())
      }
    })
  })
})
