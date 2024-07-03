import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { RateModule } from '@modules/rates'
import { ITokenType, NetworksEnum } from '@types'

describe('Rates: FetchRates', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the FetchRates', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFetchRates = sandbox.stub(FetchRates, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubFetchRates.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the FetchRates', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('onDocument', async () => {
    const fakeRate = { priceUsd: 1, priceChangeOnDayUsd: 1 }
    const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves(fakeRate as any)
    const stubLogger = sandbox.stub(logger, 'verbose')
    sandbox.stub(FetchRates, 'skipFetchToken').returns(true)

    const tokenDb = await Models.Token.create({
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      logo: 'fake-logo',
      name: 'ethereum',
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: '100',
      priceChangeOnDayUsd: '1',
      priceUsd: '1',
    })

    await FetchRates.onDocument(tokenDb)

    expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
    expect(stubLogger.calledOnceWith('Token rate updated' as any)).to.be.true

    const updatedToken = await Models.Token.findByTokenAddressAndNetwork(tokenDb.address, tokenDb.network)
    expect(updatedToken.priceUsd).to.be.equal('1')
    expect(updatedToken.priceChangeOnDayUsd).to.be.equal('1')
    expect(updatedToken.lastUpdatedAt).to.exist
    expect(updatedToken.skipFetchRate).to.be.true
  })

  describe('skipFetchToken', () => {
    it('should return true if the token is a GovernanceERC20 and price is 0', () => {
      const token = {
        type: ITokenType.GovernanceERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = FetchRates.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return false if the token is ERC20 and price is not 0', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '1',
      }

      const result = FetchRates.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.false
    })

    it('should return true if the token network is in skipTestNetworks and price is 0', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.zksyncSepolia, // assuming this is in skipTestNetworks
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = FetchRates.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return true for unknown token types with price 0', () => {
      const token = {
        type: ITokenType.unknown,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = FetchRates.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return false for known token types with non-zero price', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '100',
      }

      const result = FetchRates.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.false
    })
  })
})
