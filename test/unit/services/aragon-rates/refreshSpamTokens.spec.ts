import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenSpam from '@helpers/tokenSpam'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { RefreshSpamTokens } from '@services/aragon-rates/handlers/refreshSpamTokens'
import { ITokenType, NetworksEnum, SpamSource } from '@types'
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

    it('should also pick up unreadable-balance marks even though they score above the threshold', async () => {
      await Models.Token.create({
        address: '0xUnreadable',
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        name: 'Broken Token',
        symbol: 'BRK',
        isSpam: true,
        spamScore: 5,
        spamSource: SpamSource.UNREADABLE,
      })
      await Models.Token.create({
        address: '0xCms',
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        name: 'Cms Token',
        symbol: 'CMS',
        isSpam: true,
        spamScore: 5,
        spamSource: SpamSource.CMS,
      })

      const onDocStub = sandbox.stub(RefreshSpamTokens, 'onDocument')
      await RefreshSpamTokens.start()

      expect(onDocStub.callCount).to.equal(1)
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
      sandbox.stub(TokenSpam, 'evaluate').returns({ spamScore: 0, isSpam: false, signals: [] })

      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)

      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(
        updateStub.calledWith({
          spamScore: 0,
          isSpam: false,
          spamSource: null,
          lastUpdatedAt: mockDate,
        }),
      ).to.be.true
    })

    it('should not update token if still marked as spam', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves(undefined)
      sandbox.stub(TokenSpam, 'evaluate').returns({ spamScore: 5, isSpam: true, signals: [] })

      const updateStub = sandbox.stub(tokenDb, 'update')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('keeps an unreadable-balance mark while balanceOf still cannot be read', async () => {
      tokenDb.spamSource = SpamSource.UNREADABLE
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(Web3Helper, 'getERC20BalanceResult').resolves({ balance: null, unreadable: true })
      const getTokenStub = sandbox.stub(CoinGeckoHelper, 'getToken')
      const updateStub = sandbox.stub(tokenDb, 'update')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
      expect(getTokenStub.notCalled).to.be.true
    })

    it('keeps an unreadable-balance mark when the probe read fails for a transient reason', async () => {
      tokenDb.spamSource = SpamSource.UNREADABLE
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(Web3Helper, 'getERC20BalanceResult').resolves({ balance: null, unreadable: false })
      const getTokenStub = sandbox.stub(CoinGeckoHelper, 'getToken')
      const updateStub = sandbox.stub(tokenDb, 'update')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
      expect(getTokenStub.notCalled).to.be.true
    })

    it('clears an unreadable-balance mark once balanceOf answers again and the metadata is clean', async () => {
      tokenDb.spamSource = SpamSource.UNREADABLE
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(Web3Helper, 'getERC20BalanceResult').resolves({ balance: 0n, unreadable: false })
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves(undefined)
      sandbox.stub(TokenSpam, 'evaluate').returns({ spamScore: 0, isSpam: false, signals: [] })

      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)
      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(
        updateStub.calledWith({
          spamScore: 0,
          isSpam: false,
          spamSource: null,
          lastUpdatedAt: mockDate,
        }),
      ).to.be.true
    })

    it('should log error when exception occurs', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').rejects(new Error('API error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')
      await RefreshSpamTokens.onDocument(tokenDb)

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error RefreshSpamTokens' as any)).to.be.true
    })

    it('should pass correct params to TokenSpam.evaluate', async () => {
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      const coinGeckoData = { priceUsd: '1.5', name: 'Token', symbol: 'TKN' }
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves(coinGeckoData as any)

      const evaluateStub = sandbox.stub(TokenSpam, 'evaluate').returns({ spamScore: 0, isSpam: false, signals: [] })
      sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => new Date() } as any)

      await RefreshSpamTokens.onDocument(tokenDb)

      expect(
        evaluateStub.calledWith({
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
