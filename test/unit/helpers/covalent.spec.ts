import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CovalentHelper from '@helpers/covalent'
import logger from '@logger'
import config from '@config'
import { IToken, NetworksEnum } from '@types'
import { TokenList } from '@test/mock/fakeCovalentTokens'

describe('Helpers: Covalent', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('_rpCall', () => {
    it('Should _rpCall', async () => {
      const rpcCallStub = sandbox.stub(CovalentHelper.axiosInstance, 'get').resolves({ data: { data: true } })

      const response = await CovalentHelper._rpCall('/path')

      expect(response).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.calledWith(`${config.COVALENT.URI}/path`)).to.be.true
    })

    it('Should handle errors in _rpCall', async () => {
      const expectedError = new Error('RPC Call Failed')
      const rpcCallStub = sandbox.stub(CovalentHelper.axiosInstance, 'get').rejects(expectedError)

      const loggerStub = sandbox.stub(logger, 'error')

      await expect(CovalentHelper._rpCall('/path')).to.be.rejectedWith(expectedError)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.calledWith(`${config.COVALENT.URI}/path`)).to.be.true
      expect(loggerStub.args[0][0]).to.eq('Error in Covalent RPC Call')
    })
  })

  describe('getToken', () => {
    it('should getToken', async () => {
      const expectedToken = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        network: NetworksEnum.mainnet,
        logo: 'https://logos.covalenthq.com/tokens/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
        priceUsd: '4086.604',
        holders: 0,
        totalSupply: 0,
        priceChangeOnDayUsd: 22.262699999999768,
        lastUpdatedAt: '2024-03-12T00:28:29.991Z',
      }
      const mockResponse = TokenList

      const rpcCallStub = sandbox.stub(CovalentHelper, '_rpCall').resolves(mockResponse as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const token = (await CovalentHelper.getToken(address, NetworksEnum.mainnet)) as Partial<IToken>
      expect(loggerStub.notCalled).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true

      expect(rpcCallStub.args[0][0].startsWith(`/pricing/historical_by_addresses_v2/eth-mainnet/USD/${address}/?from=`))
        .to.be.true
      expect(token.address).to.equal(expectedToken.address)
    })

    it('should getToken with zeroAddress', async () => {
      const expectedToken = {
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        network: NetworksEnum.mainnet,
        logo: 'https://www.datocms-assets.com/86369/1669619533-ethereum.png',
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        priceUsd: '4021.0115',
        holders: 0,
        totalSupply: 0,
        priceChangeOnDayUsd: 42.428699999999935,
        lastUpdatedAt: '2024-03-13T02:45:39.390Z',
      }
      const mockResponse = [TokenList[1]]

      const rpcCallStub = sandbox.stub(CovalentHelper, '_rpCall').resolves(mockResponse as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const address = '0x0000000000000000000000000000000000000000'
      const token = (await CovalentHelper.getToken(address, NetworksEnum.mainnet)) as Partial<IToken>
      expect(loggerStub.notCalled).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true

      expect(
        rpcCallStub.args[0][0].startsWith(
          `/pricing/historical_by_addresses_v2/eth-mainnet/USD/${CovalentHelper.nativeTokenAddress}/?from=`,
        ),
      ).to.be.true
      expect(token.address).to.equal(expectedToken.address)
    })

    it('should fail getToken', async () => {
      sandbox.stub(CovalentHelper, '_rpCall').rejects(new Error('fake-error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const network = NetworksEnum.mainnet
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const result = (await CovalentHelper.getToken(address, network)) as Partial<IToken>

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error fetching token' as any)).to.be.true
    })
  })

  describe('getTokenBalance', () => {
    it('should getTokenBalance', async () => {
      const fakeResponse = {
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        updated_at: '2024-03-12T01:00:56.933198139Z',
        next_update_at: '2024-03-12T01:05:56.933198499Z',
        quote_currency: 'USD',
        chain_id: 1,
        chain_name: 'eth-mainnet',
        items: [
          {
            contract_decimals: 18,
            contract_name: 'Ether',
            contract_ticker_symbol: 'ETH',
            contract_address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            supports_erc: null,
            logo_url: 'https://www.datocms-assets.com/86369/1669619533-ethereum.png',
            contract_display_name: 'Ether',
            logo_urls: {
              token_logo_url: 'https://logos.covalenthq.com/tokens/1/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png',
              protocol_logo_url: null,
              chain_logo_url: 'https://www.datocms-assets.com/86369/1669653891-eth.svg',
            },
            last_transferred_at: '2024-03-12T01:00:23Z',
            native_token: true,
            type: 'cryptocurrency',
            is_spam: false,
            balance: '3026863674807664751607812',
            balance_24h: '3049110318692094851537300',
            quote_rate: 4066.238,
            quote_rate_24h: 4066.18,
            quote: 12307949000,
            pretty_quote: '$12,307,948,544.00',
            quote_24h: 12398232000,
            pretty_quote_24h: '$12,398,231,552.00',
            protocol_metadata: null,
            nft_data: null,
          },
        ],
        pagination: null,
      }

      const expectedResult = {
        updatedAt: fakeResponse.updated_at,
        items: [
          {
            contractAddress: fakeResponse.items[0].contract_address,
            contractName: fakeResponse.items[0].contract_name,
            contractTickerSymbol: fakeResponse.items[0].contract_ticker_symbol,
            contractDecimals: fakeResponse.items[0].contract_decimals,
            nativeToken: fakeResponse.items[0].native_token || false,
            balance: fakeResponse.items[0].balance,
            logoUrl: fakeResponse.items[0].logo_url,
          },
        ],
      }

      const rpcCallStub = sandbox.stub(CovalentHelper, '_rpCall').resolves(fakeResponse as any)

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const tokenBalanceType = await CovalentHelper.getTokenBalance(
        address,
        NetworksEnum.mainnet,
        config.DEFAULT_CURRENCY,
      )

      expect(tokenBalanceType).to.deep.eq(expectedResult)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(
        rpcCallStub.args[0][0].startsWith(
          `/eth-mainnet/address/${address}/balances_v2/?quote-currency=${config.DEFAULT_CURRENCY}`,
        ),
      ).to.be.true
    })

    it('should fail getTokenBalance', async () => {
      sandbox.stub(CovalentHelper, '_rpCall').rejects(new Error('Token balance fetch failed'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const address = '0x0000000000000000000000000000000000000000'
      const network = NetworksEnum.mainnet
      const result = await CovalentHelper.getTokenBalance(address, network, 'USD')

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error fetching token balance' as any)).to.be.true
    })
  })

  describe('networkFromCovalent', () => {
    it('should return the correct network enum for a valid Covalent network string', () => {
      const covalentNetwork = 'eth-mainnet'
      const expectedNetwork = NetworksEnum.mainnet
      const result = CovalentHelper.networkFromCovalent(covalentNetwork)
      expect(result).to.equal(expectedNetwork)
    })

    it('should return undefined for an invalid Covalent network string', () => {
      const covalentNetwork = 'invalid-network'
      const result = CovalentHelper.networkFromCovalent(covalentNetwork)
      expect(result).to.be.undefined
    })
  })
})
