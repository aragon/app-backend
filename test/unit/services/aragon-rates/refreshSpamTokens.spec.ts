import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenUtils from '@helpers/tokenUtils'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { RefreshSpamTokens } from '@services/aragon-rates/handlers/refreshSpamTokens'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonRates: RefreshSpamTokens', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the RefreshSpamTokens crawler', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubOnDocument = sandbox.stub(RefreshSpamTokens, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await RefreshSpamTokens.start()

      expect(stubLogger.calledWith('Start RefreshSpamTokens' as any)).to.be.true
      expect(stubLogger.calledWith('End RefreshSpamTokens' as any)).to.be.true
      expect(stubOnDocument.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should handle errors in the crawler', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await RefreshSpamTokens.start()

      expect(stubLogger.calledWith('End RefreshSpamTokens' as any)).to.be.true
      expect(stubLoggerError.calledOnceWith('Error RefreshSpamTokens' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should query tokens with isSpam true and spamScore below threshold', async () => {
      const spamTokens = [
        {
          address: '0xSpam1',
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.ERC20,
          name: 'Free Airdrop',
          symbol: 'SPAM',
          isSpam: true,
          spamScore: 0,
        },
        {
          address: '0xSpam2',
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.ERC20,
          name: 'Bonus Token',
          symbol: 'BONUS',
          isSpam: true,
          spamScore: 1,
        },
      ]

      await Promise.all(spamTokens.map(token => Models.Token.create(token)))

      const onDocStub = sandbox.stub(RefreshSpamTokens, 'onDocument')
      await RefreshSpamTokens.start()

      expect(onDocStub.callCount).to.equal(2)
    })
  })

  describe('onDocument', () => {
    let tokenDb: any

    beforeEach(async () => {
      tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xSpamToken',
        name: 'Airdrop Token',
        symbol: 'AIR',
        decimals: 18,
        isSpam: true,
        spamScore: 2,
        isGovernance: false,
      })
    })

    it('should skip testnet tokens', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(true)
      const updateStub = sandbox.stub(tokenDb, 'update')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('should clear isSpam flag when token is no longer spam', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
        priceUsd: '1.5',
        name: 'Airdrop Token',
        symbol: 'AIR',
      } as any)
      sandbox.stub(TokenUtils, 'shouldMarkAsSpam').returns({ spamScore: 0, isSpam: false })

      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)

      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(
        updateStub.calledWith({
          spamScore: 0,
          isSpam: false,
          lastUpdatedAt: mockDate,
        }),
      ).to.be.true
    })

    it('should not update token if still marked as spam', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves(undefined)
      sandbox.stub(TokenUtils, 'shouldMarkAsSpam').returns({ spamScore: 5, isSpam: true })

      const updateStub = sandbox.stub(tokenDb, 'update')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('should log error when exception occurs', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').rejects(new Error('API error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')
      await RefreshSpamTokens.onDocument(tokenDb)

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error RefreshSpamTokens' as any)).to.be.true
    })

    it('should pass correct params to shouldMarkAsSpam', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      const coinGeckoData = { priceUsd: '1.5', name: 'Token', symbol: 'TKN' }
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves(coinGeckoData as any)

      const shouldMarkAsSpamStub = sandbox.stub(TokenUtils, 'shouldMarkAsSpam').returns({ spamScore: 0, isSpam: false })
      sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => new Date() } as any)

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(
        shouldMarkAsSpamStub.calledWith({
          name: tokenDb.name,
          symbol: tokenDb.symbol,
          logo: tokenDb.logo,
          tokenType: tokenDb.type,
          isGovernance: tokenDb.isGovernance,
          isTestnet: false,
          coinGeckoInfo: {
            priceUsd: coinGeckoData.priceUsd,
          },
        }),
      ).to.be.true
    })
  })
})
