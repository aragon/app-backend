import config from '@config'
import TokenSpam, { type SpamSignal } from '@helpers/tokenSpam'
import logger from '@logger'
import { ITokenType } from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

describe('TokenSpam', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn').returns(undefined as any)
    sandbox.stub(logger, 'logMeta').returns({})
  })

  afterEach(() => {
    sandbox.restore()
  })

  const evaluateParams = {
    name: 'Free Airdrop',
    symbol: 'FREE',
    logo: null,
    tokenType: ITokenType.ERC20,
    isGovernance: false,
    isTestnet: false,
    coinGeckoInfo: null,
  }

  describe('score', () => {
    it('returns zero with no signals for a clean token', () => {
      const result = TokenSpam.score('Ethereum', 'ETH', 'https://logo.com/eth.png')
      expect(result.spamScore).to.equal(0)
      expect(result.signals).to.deep.equal([])
    })

    it('names the reason for every point it adds', () => {
      const result = TokenSpam.score('Free Airdrop https://scam.com', 'CLAIM', null)
      const reasons = result.signals.map(signal => signal.reason)
      expect(reasons).to.include('noLogo')
      expect(reasons).to.include('url')
      expect(reasons).to.include('highRiskKeyword')
      expect(reasons).to.include('lowRiskKeyword')
      expect(result.spamScore).to.equal(result.signals.reduce((sum, signal) => sum + signal.points, 0))
    })

    it('scores keyword matches per occurrence, same as the historical scoring', () => {
      expect(TokenSpam.score('Airdrop Token', 'AIR', 'logo').spamScore).to.equal(2)
      expect(TokenSpam.score('Claim Token', 'CLM', 'logo').spamScore).to.equal(1)
      expect(TokenSpam.score('Ethereum', 'ETH', null).spamScore).to.equal(1)
    })
  })

  describe('homoglyph detectors', () => {
    const reasons = (name: string, symbol: string) =>
      TokenSpam.score(name, symbol, 'https://logo.com/x.png').signals.map(signal => signal.reason)

    it('catches lookalike-script spoofs seen on mainnet', () => {
      expect(reasons('Tether USD', 'UЅDТ')).to.include('scriptSpoof') // Cyrillic
      expect(reasons('ЕТН', 'ЕТН')).to.include('scriptSpoof') // all Cyrillic
      expect(reasons('ꓴꓢꓓꓔ', 'ꓴꓢꓓꓔ')).to.include('scriptSpoof') // Lisu
      expect(reasons('ՍՏDТ', 'ՍՏDТ')).to.include('scriptSpoof') // Armenian
      expect(reasons('CBDH Fluids', 'RFLBΑ')).to.include('scriptSpoof') // Greek
    })

    it('catches rare marks on Latin letters but not common European diacritics', () => {
      expect(reasons('USD Coin', 'ỤSDC')).to.include('scriptSpoof')
      expect(reasons('USD Coin', 'USḌC')).to.include('scriptSpoof')
      expect(reasons('Tether USD', 'U᠋S᠋D᠋T')).to.include('scriptSpoof')
      expect(reasons('Brötchen', 'BRÖTCHEN')).to.deep.equal([])
      expect(reasons('Flōki', 'FLŌKI')).to.deep.equal([])
      expect(reasons('Pokéball', 'POKÉMON')).to.deep.equal([])
    })

    it('catches invisible characters and exotic spaces', () => {
      expect(reasons('USD⁣C', 'USD⁣C')).to.include('invisibleChars') // invisible separator
      expect(reasons('BNB ', 'BNB ')).to.include('invisibleChars') // non-breaking space
      expect(reasons('­ETH', '­ETH')).to.include('invisibleChars') // soft hyphen
    })

    it('flags a name only when a single word mixes Latin with a lookalike script', () => {
      expect(reasons('Dаi Stаblеcоin', 'DAI')).to.include('scriptSpoof')
      expect(reasons('마라도의 파수꾼', 'GUARD')).to.deep.equal([])
    })

    it('leaves legitimate non-ASCII tokens alone', () => {
      expect(reasons('어떻게 토큰 이름이 로제콩나물해장국', 'RKH')).to.deep.equal([])
      expect(reasons('América', 'AME')).to.deep.equal([])
      expect(reasons('小白', '小白')).to.deep.equal([])
      expect(reasons('BORK by 𝓜𝓪𝓽𝓽 𝓕𝓾𝓻𝓲𝓮', '$BORK')).to.deep.equal([])
      expect(reasons('420K', '⁴²⁰K')).to.deep.equal([])
      expect(reasons('ᗪOᖇK ᒪOᖇᗪ', 'DORK')).to.deep.equal([])
      expect(reasons('Tether USD', 'USD₮')).to.deep.equal([])
      expect(reasons('W🍖', 'W🍖')).to.deep.equal([])
      expect(reasons(' UNI', ' UNI')).to.deep.equal([]) // plain ASCII space is sloppy metadata, not a spoof
    })

    it('keeps homoglyph points out of the score while the shadow flag is on', () => {
      const shadowed = TokenSpam.score('Tether USD', 'UЅDТ', 'https://logo.com/t.png')
      expect(shadowed.spamScore).to.equal(0)
      expect(shadowed.signals.map(signal => signal.reason)).to.deep.equal(['scriptSpoof'])

      sandbox.stub(config.SPAM_DETECTION, 'HOMOGLYPH_SHADOW').value(false)
      const live = TokenSpam.score('Tether USD', 'UЅDТ', 'https://logo.com/t.png')
      expect(live.spamScore).to.equal(3)
    })
  })

  describe('evaluate', () => {
    it('marks an unpriced token at the mark threshold', () => {
      const verdict = TokenSpam.evaluate(evaluateParams)
      expect(verdict.isSpam).to.be.true
      expect(verdict.spamScore).to.be.gte(TokenSpam.MARK_THRESHOLD)
    })

    it('lets a CoinGecko price vouch for a token below the hard threshold', () => {
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Claim Token',
        symbol: 'CLM',
        coinGeckoInfo: { priceUsd: '1.5' },
      })
      expect(verdict.isSpam).to.be.false
    })

    it('never marks governance, native or escrow-adapter tokens', () => {
      expect(TokenSpam.evaluate({ ...evaluateParams, isGovernance: true }).isSpam).to.be.false
      expect(TokenSpam.evaluate({ ...evaluateParams, tokenType: ITokenType.native }).isSpam).to.be.false
      expect(TokenSpam.evaluate({ ...evaluateParams, tokenType: ITokenType.escrowAdapter }).isSpam).to.be.false
    })

    it('never marks on testnets', () => {
      expect(TokenSpam.evaluate({ ...evaluateParams, isTestnet: true }).isSpam).to.be.false
    })

    it('counts extra signals from the caller toward the score and the verdict', () => {
      const extraSignals: SpamSignal[] = [{ reason: 'unreadableBalance', points: 5 }]
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Ethereum',
        symbol: 'ETH',
        logo: 'https://logo.com/eth.png',
        extraSignals,
      })
      expect(verdict.isSpam).to.be.true
      expect(verdict.spamScore).to.equal(5)
      expect(verdict.signals).to.deep.equal(extraSignals)
    })

    it('logs but does not mark a homoglyph spoof while the shadow flag is on', () => {
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Tether USD',
        symbol: 'UЅDТ',
        logo: 'https://logo.com/t.png',
      })
      expect(verdict.isSpam).to.be.false
      expect(verdict.spamScore).to.equal(0)
      expect(verdict.signals.map(signal => signal.reason)).to.deep.equal(['scriptSpoof'])
      expect((logger.warn as sinon.SinonStub).calledWithMatch('Homoglyph shadow signal fired')).to.be.true
    })

    it('does not shadow-log testnet tokens, since they can never be marked', () => {
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Tether USD',
        symbol: 'UЅDТ',
        logo: 'https://logo.com/t.png',
        isTestnet: true,
      })
      expect(verdict.isSpam).to.be.false
      expect((logger.warn as sinon.SinonStub).called).to.be.false
    })

    it('marks a homoglyph spoof once the shadow flag is off', () => {
      sandbox.stub(config.SPAM_DETECTION, 'HOMOGLYPH_SHADOW').value(false)
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Tether USD',
        symbol: 'UЅDТ',
        logo: 'https://logo.com/t.png',
      })
      expect(verdict.isSpam).to.be.true
      expect(verdict.spamScore).to.equal(3)
    })

    it('extra signals clear the hard threshold even when CoinGecko has a price', () => {
      const verdict = TokenSpam.evaluate({
        ...evaluateParams,
        name: 'Ethereum',
        symbol: 'ETH',
        logo: 'https://logo.com/eth.png',
        coinGeckoInfo: { priceUsd: '1.5' },
        extraSignals: [{ reason: 'unreadableBalance', points: 5 }],
      })
      expect(verdict.isSpam).to.be.true
    })
  })
})
