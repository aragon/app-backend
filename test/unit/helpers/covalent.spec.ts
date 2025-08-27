import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CovalentHelper from '@helpers/covalent'
import logger from '@logger'
import config from '@config'
import { IToken, ITokenType, NetworksEnum } from '@types'
import { TokenList } from '@test/mock/fakeCovalentTokens'
import dayjs from '@helpers/dayjs'
import utils from '@helpers/utils'

describe('Helpers: Covalent', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('networksMap', () => {
    expect(CovalentHelper.nativeTokens[NetworksEnum.ethereumMainnet]).to.equal(
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    )
    expect(CovalentHelper.nativeTokens[NetworksEnum.ethereumSepolia]).to.equal(
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    )
    expect(CovalentHelper.nativeTokens[NetworksEnum.polygonMainnet]).to.equal(
      '0x0000000000000000000000000000000000001010',
    )
    expect(CovalentHelper.nativeTokens[NetworksEnum.arbitrumMainnet]).to.equal(
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    )
    expect(CovalentHelper.nativeTokens[NetworksEnum.baseMainnet]).to.equal('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
    expect(CovalentHelper.nativeTokens[NetworksEnum.zksyncMainnet]).to.equal(
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    )
    expect(CovalentHelper.nativeTokens[NetworksEnum.zksyncSepolia]).to.equal(
      '0x000000000000000000000000000000000000800a',
    )
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
      const expectedError: any = new Error('RPC Call Failed')

      sandbox.stub(CovalentHelper.axiosInstance, 'get').rejects(expectedError)

      const stubLogger = sandbox.stub(logger, 'warn')

      await expect(CovalentHelper._rpCall('/path')).to.be.rejectedWith(expectedError)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error in Covalent RPC Call' as any)).to.be.true
    })
  })

  describe('getToken', () => {
    it('should getToken', async () => {
      const fakeResponse = TokenList[0]
      const rpcCallStub = sandbox.stub(CovalentHelper, '_rpCall').resolves([fakeResponse] as any)

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet
      const pastDays = 4
      const token = (await CovalentHelper.getToken(address, network, pastDays)) as Partial<IToken>
      expect(rpcCallStub.calledOnce).to.be.true
      expect(token.address).to.equal(address)
      expect(token.name).to.equal(fakeResponse.contract_name)
      expect(token.symbol).to.equal(fakeResponse.contract_ticker_symbol)
      expect(token.decimals).to.equal(fakeResponse.contract_decimals)
      expect(token.logo).to.equal(fakeResponse.logo_url)

      const networkId = CovalentHelper.networkToCovalent(network)
      const back2Days = dayjs().subtract(pastDays, 'day').format('YYYY-MM-DD')
      const path = `/pricing/historical_by_addresses_v2/${networkId}/${config.DEFAULT_CURRENCY}/${address}/?from=${back2Days}`
      expect(rpcCallStub.args[0][0]).to.equal(path)
    })

    it('should getToken with zeroAddress', async () => {
      const expectedToken = {
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        network: NetworksEnum.ethereumMainnet,
        logo: 'https://www.datocms-assets.com/86369/1669619533-ethereum.png',
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        priceUsd: '4021.0115',
        holders: 0,
        totalSupply: '0',
        lastUpdatedAt: '2024-03-13T02:45:39.390Z',
      }
      const mockResponse = [TokenList[1]]

      const rpcCallStub = sandbox.stub(CovalentHelper, '_rpCall').resolves(mockResponse as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const address = '0x0000000000000000000000000000000000000000'
      const token = (await CovalentHelper.getToken(address, NetworksEnum.ethereumMainnet)) as Partial<IToken>
      expect(loggerStub.notCalled).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true

      expect(
        rpcCallStub.args[0][0].startsWith(
          `/pricing/historical_by_addresses_v2/eth-mainnet/USD/${CovalentHelper.nativeTokens[NetworksEnum.ethereumMainnet]}/?from=`,
        ),
      ).to.be.true
      expect(token.address).to.equal(utils.zeroAddress)
    })

    it('should fail getToken', async () => {
      sandbox.stub(CovalentHelper, '_rpCall').rejects(new Error('fake-error'))

      const network = NetworksEnum.ethereumMainnet
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const result = (await CovalentHelper.getToken(address, network)) as Partial<IToken>

      expect(result).to.be.false
    })
  })

  describe('getTokenBalance', () => {
    it('should getTokenBalance', async () => {
      const fakeResponse = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
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
        NetworksEnum.ethereumMainnet,
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

      const address = '0x0000000000000000000000000000000000000000'
      const network = NetworksEnum.ethereumMainnet
      const result = await CovalentHelper.getTokenBalance(address, network, 'USD')

      expect(result).to.be.false
    })
  })

  describe('networkFromCovalent', () => {
    it('should return the correct network enum for a valid Covalent network string', () => {
      const covalentNetwork = 'eth-mainnet'
      const expectedNetwork = NetworksEnum.ethereumMainnet
      const result = CovalentHelper.networkFromCovalent(covalentNetwork)
      expect(result).to.equal(expectedNetwork)
    })

    it('should return undefined for an invalid Covalent network string', () => {
      const covalentNetwork = 'invalid-network'
      const result = CovalentHelper.networkFromCovalent(covalentNetwork)
      expect(result).to.be.undefined
    })
  })

  describe('getTokenType', () => {
    it('should return ITokenType.native if no ERC support is indicated', () => {
      const token = { supports_erc: [] }
      const result = CovalentHelper.getTokenType(token as any)
      expect(result).to.equal(ITokenType.native)
    })

    it('should return ITokenType.ERC20 if token supports ERC20', () => {
      const token = { supports_erc: ['erc20'] }
      const result = CovalentHelper.getTokenType(token as any)
      expect(result).to.equal(ITokenType.ERC20)
    })

    it('should return ITokenType.ERC721 if token supports ERC721 and not ERC20', () => {
      const token = { supports_erc: ['erc721'] }
      const result = CovalentHelper.getTokenType(token as any)
      expect(result).to.equal(ITokenType.ERC721)
    })
  })

  describe('getTokenTotalSupply', () => {
    it('should get token supply', async () => {
      const rpcCallStub = sandbox
        .stub(CovalentHelper, '_rpCall')
        .resolves({ items: [{ total_supply: '100000000000000000000000000' }] } as any)

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet

      const supply = await CovalentHelper.getTokenTotalSupply(address, network, 1234)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(supply).to.equal('100000000000000000000000000')

      expect(rpcCallStub.args[0][0].includes(address)).to.be.true
    })

    it('should fail to get token supply', async () => {
      sandbox.stub(CovalentHelper, '_rpCall').rejects(new Error('Token supply fetch failed'))

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

      const supply = await CovalentHelper.getTokenTotalSupply(address, NetworksEnum.ethereumMainnet, 123)

      expect(supply).to.be.null
    })
  })
  describe('getTokenTotalHolders', () => {
    it('should get token holders', async () => {
      const rpcCallStub = sandbox
        .stub(CovalentHelper, '_rpCall')
        .resolves({ pagination: { total_count: 100 }, items: [{ a: 'xxx', total_supply: '12' }] } as any)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet

      const holders = await CovalentHelper.getTokenSupplyAndHolders(address, network, 12345)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(holders).to.deep.eq({
        totalSupply: '12',
        totalHolders: 100,
      })
    })
  })
})
