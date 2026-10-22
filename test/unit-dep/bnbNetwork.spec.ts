import CoinGeckoHelper from '@helpers/coinGecko'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import logger from '@logger'
import MongoDB from '@modules/mongo'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integration: BNB mainnet (Etherscan V2)', () => {
  let dropStub: sinon.SinonStub
  let sandbox: sinon.SinonSandbox

  const WBNB_TOKEN = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'

  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchContractSourceCode (Etherscan V2)', () => {
    it('returns verified source for the WBNB contract via chain id 56', async function () {
      this.timeout(30_000)

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.ETHERSCAN,
        WBNB_TOKEN,
        NetworksEnum.bnbMainnet,
      )

      expect(result, 'source code result must not be null').to.not.be.null
      expect(result![0]).to.have.property('ContractName').that.is.a('string').and.not.empty
    })
  })

  describe('getBlockByTimestamp (Etherscan V2)', () => {
    it('resolves a block number for a recent timestamp', async function () {
      this.timeout(30_000)

      const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3
      const block = await evmExplorerClient.getBlockByTimestamp(
        EvmExplorerEnum.ETHERSCAN,
        timestamp,
        NetworksEnum.bnbMainnet,
        'before',
      )

      expect(block, 'block number must be a positive integer').to.be.a('number').and.greaterThan(0)
    })
  })

  describe('Web3Provider.fetchContractSourceCode (network routing)', () => {
    it('routes bnb-mainnet to Etherscan and returns verified source', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractSourceCode({
        address: WBNB_TOKEN,
        network: NetworksEnum.bnbMainnet,
      })

      expect(result, 'Web3Provider must return verified source on bnb').to.not.be.null
      expect(result).to.be.an('array').with.length.greaterThan(0)
      expect(result![0]).to.have.property('ContractName').that.is.not.empty
    })
  })

  describe('Web3Provider.fetchContractCreation (network routing)', () => {
    it('routes bnb-mainnet to Etherscan and returns creation tx', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractCreation({
        address: WBNB_TOKEN,
        network: NetworksEnum.bnbMainnet,
      })

      expect(result.transactionHash, 'creation tx hash must be populated').to.match(/^0x[a-fA-F0-9]{64}$/)
    })
  })

  describe('CoinGecko price fetching', () => {
    it('returns native BNB price for bnb-mainnet (nativeTokenId=binancecoin)', async function () {
      this.timeout(30_000)

      const native = await CoinGeckoHelper.getNativeToken(NetworksEnum.bnbMainnet)

      expect(native, 'native token must resolve on bnb (binancecoin coin id)').to.not.equal(false)
      const token = native as Exclude<typeof native, false>
      expect(token.type).to.equal(ITokenType.native)
      expect(token.symbol?.toLowerCase()).to.equal('bnb')
      expect(Number(token.priceUsd), 'native BNB priceUsd must be positive').to.be.greaterThan(0)
    })

    it('returns ERC-20 token data for the WBNB token (networkId=bsc)', async function () {
      this.timeout(30_000)

      const token = await CoinGeckoHelper.getToken(WBNB_TOKEN, NetworksEnum.bnbMainnet)

      if (token === false) {
        console.warn(`CoinGecko has not indexed ${WBNB_TOKEN} on network "bsc" yet — skipping price assertion`)
        this.skip()
      } else {
        expect(token, 'CoinGecko must return WBNB token data on bsc').to.not.equal(false)
        const erc20 = token as Exclude<typeof token, false>
        expect(erc20.type).to.equal(ITokenType.ERC20)
        expect(erc20.symbol).to.be.a('string').and.not.empty
        expect(erc20.decimals).to.equal(18)
        expect(erc20.address.toLowerCase()).to.equal(WBNB_TOKEN.toLowerCase())
      }
    })
  })
})
