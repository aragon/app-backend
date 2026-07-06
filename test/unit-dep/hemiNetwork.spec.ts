import CoinGeckoHelper from '@helpers/coinGecko'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import MongoDB from '@modules/mongo'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integration: Hemi mainnet (Blockscout)', () => {
  let dropStub: sinon.SinonStub
  let saveAndGetTokenStub: sinon.SinonStub

  const HEMI_TOKEN = '0x99e3dE3817F6081B2568208337ef83295b7f591D'
  const HEMI_HOLDER = '0xf14A494Fb66927Df0b1495E5F09b410e5D8517C3'

  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  describe('fetchContractSourceCode (Blockscout)', () => {
    it('returns verified source for the HEMI ERC-20 contract', async function () {
      this.timeout(30_000)

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT,
        HEMI_TOKEN,
        NetworksEnum.hemiMainnet,
      )

      expect(result, 'source code result must not be null').to.not.be.null
      expect(result).to.be.an('array').with.length.greaterThan(0)

      const sourceCode = result![0]
      expect(sourceCode).to.have.property('SourceCode').that.is.a('string').and.not.empty
      expect(sourceCode).to.have.property('ContractName').that.is.a('string').and.not.empty
      expect(sourceCode).to.have.property('ABI').that.is.a('string').and.not.empty
    })
  })

  describe('fetchContractCreation (Blockscout)', () => {
    it('returns creation tx hash for the HEMI ERC-20 contract', async function () {
      this.timeout(30_000)

      const result = await evmExplorerClient.fetchContractCreation(
        EvmExplorerEnum.BLOCKSCOUT,
        HEMI_TOKEN,
        NetworksEnum.hemiMainnet,
      )

      expect(result).to.be.an('object')
      expect(result.address.toLowerCase()).to.equal(HEMI_TOKEN.toLowerCase())
      expect(result.transactionHash, 'creation tx hash must be populated').to.match(/^0x[a-fA-F0-9]{64}$/)
    })
  })

  describe('getBlockByTimestamp (Blockscout)', () => {
    it('resolves a block number for a recent timestamp', async function () {
      this.timeout(30_000)

      const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3
      const block = await evmExplorerClient.getBlockByTimestamp(
        EvmExplorerEnum.BLOCKSCOUT,
        timestamp,
        NetworksEnum.hemiMainnet,
        'before',
      )

      expect(block, 'block number must be a positive integer').to.be.a('number').and.greaterThan(0)
    })
  })

  describe('Web3Provider.fetchContractSourceCode (network routing)', () => {
    it('routes hemi-mainnet to Blockscout and returns verified source', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractSourceCode({
        address: HEMI_TOKEN,
        network: NetworksEnum.hemiMainnet,
      })

      expect(result, 'Web3Provider must return verified source on hemi').to.not.be.null
      expect(result).to.be.an('array').with.length.greaterThan(0)
      expect(result![0]).to.have.property('ContractName').that.is.not.empty
    })
  })

  describe('Web3Provider.fetchContractCreation (network routing)', () => {
    it('routes hemi-mainnet to Blockscout and returns creation tx', async function () {
      this.timeout(30_000)

      const result = await Web3Provider.fetchContractCreation({
        address: HEMI_TOKEN,
        network: NetworksEnum.hemiMainnet,
      })

      expect(result.transactionHash, 'creation tx hash must be populated').to.match(/^0x[a-fA-F0-9]{64}$/)
    })
  })

  describe('CoinGecko price fetching', () => {
    it('returns native ETH price for hemi-mainnet (nativeTokenId=ethereum)', async function () {
      this.timeout(30_000)

      const native = await CoinGeckoHelper.getNativeToken(NetworksEnum.hemiMainnet)

      expect(native, 'native token must resolve on hemi (ethereum coin id)').to.not.equal(false)
      const token = native as Exclude<typeof native, false>
      expect(token.type).to.equal(ITokenType.native)
      expect(token.symbol?.toLowerCase()).to.equal('eth')
      expect(Number(token.priceUsd), 'native ETH priceUsd must be positive').to.be.greaterThan(0)
    })

    it('returns ERC-20 token data for the HEMI token (networkId=hemi)', async function () {
      this.timeout(30_000)

      const token = await CoinGeckoHelper.getToken(HEMI_TOKEN, NetworksEnum.hemiMainnet)

      if (token === false) {
        console.warn(`CoinGecko has not indexed ${HEMI_TOKEN} on network "hemi" yet — skipping price assertion`)
        this.skip()
      } else {
        expect(token.type).to.equal(ITokenType.ERC20)
        expect(token.symbol).to.be.a('string').and.not.empty
        expect(token.decimals).to.equal(18)
        expect(token.address.toLowerCase()).to.equal(HEMI_TOKEN.toLowerCase())
      }
    })
  })
})
