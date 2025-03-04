import { DefaultNetworkTokenProvider } from '@providers/tokenDetailProvider/defaultNetworkProvider'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import utils from '@helpers/utils'
import { RateModule } from '@modules/rates'
import { ProxyToken } from '@modules/proxyToken'
import BlockScout from '@helpers/blockScout'
import CovalentHelper from '@helpers/covalent'
import Web3Helper from '@helpers/web3'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Module: DefaultTokenProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchTokenDetails', () => {
    let tokenRate: any
    beforeEach(() => {
      tokenRate = {
        priceUsd: '1',
        priceChangeOnDayUsd: '1',
        address: '0x123',
        isGovernance: false,
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
      }
    })

    it('should fetch token details when token is native', async () => {
      tokenRate.type = ITokenType.native
      tokenRate.isGovernance = false

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('1')
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('0')
    })

    it('should fetch token details when token is not native', async () => {
      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)
      const tokenFullDetails = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
        isGovernance: true,
        type: ITokenType.ERC20,
        holders: 10,
        totalSupply: '100',
        priceUsd: '1',
      }

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(tokenFullDetails as any)

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('1')
      expect(result.tokenDetails.name).to.equal('test')
      expect(result.tokenDetails.symbol).to.equal('TST')
      expect(result.tokenDetails.decimals).to.equal(18)
      expect(result.tokenDetails.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token is not native and tokenFullDetails is null', async () => {
      tokenRate.type = ITokenType.ERC20
      tokenRate.isGovernance = true

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)
      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null as any)
      const covalentMetrics = {
        totalHolders: 10,
        totalSupply: '100',
      }
      const covalentMetricsStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(covalentMetrics as any)

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(covalentMetricsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('1')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should not fetch details when token is not erc20 and it is nft with no decimals', async () => {
      tokenRate.isGovernance = true
      tokenRate.type = ITokenType.ERC721
      tokenRate.name = 'Test'
      tokenRate.symbol = 'TST'
      tokenRate.decimals = 0
      tokenRate.priceUsd = '0'

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 10,
        totalSupply: '100',
      })

      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.false
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('0')
      expect(result.tokenDetails.name).to.equal('Test')
      expect(result.tokenDetails.symbol).to.equal('TST')
      expect(result.tokenDetails.decimals).to.equal(0)
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token rate is missing name, symbol, or decimals', async () => {
      tokenRate.isGovernance = true
      tokenRate.type = ITokenType.ERC20
      tokenRate.name = null
      tokenRate.symbol = null
      tokenRate.decimals = null
      tokenRate.priceUsd = '0'

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 10,
        totalSupply: '100',
      })

      const onChainTokenInfo = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
      }
      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo').resolves(onChainTokenInfo as any)

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.true
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('0')
      expect(result.tokenDetails.name).to.equal('test')
      expect(result.tokenDetails.symbol).to.equal('TST')
      expect(result.tokenDetails.decimals).to.equal(18)
      expect(result.tokenDetails.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token is GovernanceERC20 and tokenMetrics are missing', async () => {
      tokenRate.type = ITokenType.ERC20
      tokenRate.isGovernance = true
      tokenRate.priceUsd = '0'
      tokenRate.name = null
      tokenRate.decimals = null

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 0,
        totalSupply: '0',
      })

      const onChainTokenInfo = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
      }
      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo').resolves(onChainTokenInfo as any)

      const web3TokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(10n)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.true
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('0')
      expect(result.tokenDetails.name).to.equal('test')
      expect(result.tokenDetails.symbol).to.equal('TST')
      expect(result.tokenDetails.decimals).to.equal(18)
      expect(result.tokenDetails.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('10')
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(web3TokenTotalSupplyStub.calledOnce).to.be.true
    })

    it('should fetch token details when token is in whitelisted', async () => {
      tokenRate.priceUsd = '0'
      tokenRate.name = 'test'
      tokenRate.symbol = 'TST'
      tokenRate.decimals = 0
      tokenRate.type = ITokenType.ERC721

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 0,
        totalSupply: '0',
      })

      const isWhiteListedTokenStub = sandbox.stub(Web3Helper, 'isWhitelistedToken').resolves(true)

      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const web3TokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(10n)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await DefaultNetworkTokenProvider.fetchTokenDetails(
        tokenRate,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.false
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenDetails.priceUsd).to.equal('0')
      expect(result.tokenDetails.name).to.equal('test')
      expect(result.tokenDetails.symbol).to.equal('TST')
      expect(result.tokenDetails.decimals).to.equal(0)
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('10')
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(web3TokenTotalSupplyStub.calledOnce).to.be.true
      expect(isWhiteListedTokenStub.called).to.be.true
    })
  })
})
