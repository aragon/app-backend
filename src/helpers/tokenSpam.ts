import config from '@config'
import logger from '@logger'
import { ITokenType } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:tokenSpam' })

/**
 * The single owner of token spam decisions: what raises a token's score, which tokens are
 * exempt, and where the thresholds sit. Everything else — token creation, the rates
 * re-checker, asset syncing — asks this module instead of keeping its own copy of the rules.
 *
 * Detection is a list of independent detectors. Each returns a named signal rather than an
 * anonymous score increment, so a verdict can always answer "why": not "this token scored 4"
 * but "it has no logo and its name carries a short-url domain".
 */

export type SpamReason =
  | 'noLogo'
  | 'url'
  | 'highRiskKeyword'
  | 'lowRiskKeyword'
  | 'redFlag'
  | 'unreadableBalance'
  | 'invisibleChars'
  | 'scriptSpoof'

export interface SpamSignal {
  reason: SpamReason
  points: number
}

export interface ISpamVerdict {
  spamScore: number
  isSpam: boolean
  signals: SpamSignal[]
}

interface IDetectorInput {
  name: string
  symbol: string
  combined: string
  normalized: string
  logo?: string | null
}

const HIGH_RISK_KEYWORDS = [
  'airdrop',
  'giveaway',
  'casino',
  'mystery',
  'voucher',
  'visit',
  'ads',
  'promotion',
  'prize',
  'lucky',
  'bonus',
  'free',
]

const LOW_RISK_KEYWORDS = [
  'claim',
  'reward',
  'rewards',
  'join',
  'gift',
  'win',
  'box',
  'official',
  'link',
  'sign',
  'confirm',
]

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/i
const SHORT_URL_REGEX = /\b[a-z0-9-]+\.(ly|io|co|me|link|site|click|top|win|vip|gg|app)\b/i

const RED_FLAGS = [
  /[▷►▶→🎁💰🚀💎🔥✨🎉🏆💵💲🤑]/u,
  /\$[A-Z]+\s+.*\./,
  /use.*official.*link/i,
  /trust.*wallet.*mystery/i,
  /ads:\s*/i,
  /!\s*ads/i,
  /!\s*\$\d+/i,
  /\$\d{3,}/,
  /claim[a-z]*\.(io|com|net|org)/i,
  /(bonus|free|gift|airdrop|reward)[a-z-]*\.(net|org|com|io)/i,
]

// Homoglyph spoofs impersonate a well known ticker with characters that render like Latin but
// are not - `UЅDТ` with a Cyrillic Ѕ and Т, `USD⁣C` with an invisible separator, `PYỤSD` with a
// combining dot. Detection is by Unicode property, never by curated character or ticker lists,
// so new lookalikes and spoofs of unlisted tickers are covered without maintenance. Whole
// foreign-script names (Korean, CJK), emoji and superscripts do not carry these properties.

// Format characters (zero width spaces and joiners, bidi overrides, invisible operators, BOM)
// and any whitespace other than a plain space take up no visible width in a name.
const INVISIBLE_CHARS = /\p{Cf}|[^\S ]/u

// Scripts whose letters are visually identical to Latin in common fonts. Lisu is included
// because its letterforms are borrowed uppercase Latin - `ꓴꓢꓓꓔ` reads as USDT - and the spam
// farms on dev data also use Armenian (`Ս`, `Տ`).
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Lisu}\p{Script=Armenian}]/u
const LATIN_LETTER = /\p{Script=Latin}/u
// Common European diacritics compose into precomposed letters in the basic Latin blocks, so
// Brötchen and Flōki stay clean under NFC. What reads as impersonation is a combining mark that
// survives NFC on a Latin base (`U᠋S᠋D᠋T`) or a letter from the rarer Latin Extended Additional
// block (`UṢDC`, `ỤSDC`).
const UNCOMPOSED_MARK_ON_LATIN = /\p{Script=Latin}\p{M}/u
const RARE_PRECOMPOSED_LATIN = /[Ḁ-ỿ]/u

// While the shadow flag is on these reasons are reported in signals and logged, but their
// points do not count toward the score - nothing gets marked by them.
const SHADOW_REASONS = new Set<SpamReason>(['invisibleChars', 'scriptSpoof'])

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const countKeywordMatches = (combined: string, keywords: string[]): number => {
  let count = 0
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi')
    const matches = combined.match(regex)
    if (matches) {
      count += matches.length
    }
  }
  return count
}

const detectors: Array<(input: IDetectorInput) => SpamSignal | null> = [
  ({ logo }) => (logo ? null : { reason: 'noLogo', points: 1 }),

  ({ combined, normalized }) => {
    if (URL_REGEX.test(combined) || SHORT_URL_REGEX.test(combined) || SHORT_URL_REGEX.test(normalized)) {
      return { reason: 'url', points: 3 }
    }
    return null
  },

  ({ combined }) => {
    const matches = countKeywordMatches(combined, HIGH_RISK_KEYWORDS)
    return matches ? { reason: 'highRiskKeyword', points: 2 * matches } : null
  },

  ({ combined }) => {
    const matches = countKeywordMatches(combined, LOW_RISK_KEYWORDS)
    return matches ? { reason: 'lowRiskKeyword', points: matches } : null
  },

  ({ combined, normalized }) => {
    const hits = RED_FLAGS.filter(pattern => pattern.test(combined) || pattern.test(normalized)).length
    return hits ? { reason: 'redFlag', points: 2 * hits } : null
  },

  ({ name, symbol }) => {
    if (INVISIBLE_CHARS.test(name) || INVISIBLE_CHARS.test(symbol)) {
      return { reason: 'invisibleChars', points: 3 }
    }
    return null
  },

  ({ name, symbol }) => {
    // symbols are expected plain, so any lookalike-script letter or a mark on a Latin base counts;
    // names legitimately carry whole foreign words, so only a word mixing Latin with a lookalike
    // script counts there
    const symbolNfc = symbol.normalize('NFC')
    const symbolSpoofed =
      LOOKALIKE_SCRIPT.test(symbol) ||
      UNCOMPOSED_MARK_ON_LATIN.test(symbolNfc) ||
      RARE_PRECOMPOSED_LATIN.test(symbolNfc)
    const nameSpoofed = name.split(/\s+/).some(word => LATIN_LETTER.test(word) && LOOKALIKE_SCRIPT.test(word))
    return symbolSpoofed || nameSpoofed ? { reason: 'scriptSpoof', points: 3 } : null
  },
]

const TokenSpam = {
  // A token at or above this is marked when nothing vouches for it (no CoinGecko price).
  MARK_THRESHOLD: 2,
  // At or above this the token is marked unconditionally - not even a CoinGecko price saves it.
  HARD_MARK_THRESHOLD: 5,
  // isTokenSyncable refuses unknown tokens at or above this, before any DB row exists.
  SYNCABLE_THRESHOLD: 3,

  // balanceOf reverting means there is no balance to display, on any network. The points
  // clear the hard mark threshold so not even a CoinGecko price saves the token.
  UNREADABLE_BALANCE_SIGNAL: { reason: 'unreadableBalance', points: 5 } as SpamSignal,

  score(name: string, symbol: string, logo?: string | null): { spamScore: number; signals: SpamSignal[] } {
    const formattedName = (name || '').toLowerCase()
    const formattedSymbol = (symbol || '').toLowerCase()
    const combined = `${formattedName} ${formattedSymbol}`
    // collapses "c l a i m" style spacing so keyword and domain patterns still see the word
    const normalized = combined.replace(/(\w)\s+(?=\w)/g, '$1')

    const signals: SpamSignal[] = []
    for (const detector of detectors) {
      const signal = detector({ name: name || '', symbol: symbol || '', combined, normalized, logo })
      if (signal) {
        signals.push(signal)
      }
    }

    const shadow = config.SPAM_DETECTION.HOMOGLYPH_SHADOW
    const spamScore = signals.reduce(
      (sum, signal) => sum + (shadow && SHADOW_REASONS.has(signal.reason) ? 0 : signal.points),
      0,
    )

    return { spamScore, signals }
  },

  evaluate(params: {
    name: string
    symbol: string
    logo: string | null
    tokenType: ITokenType
    isGovernance: boolean
    isTestnet: boolean
    coinGeckoInfo: { priceUsd?: string } | null
    // behavioural facts observed by the caller that scoring cannot see, e.g. balanceOf reverting
    extraSignals?: SpamSignal[]
  }): ISpamVerdict {
    const { name, symbol, logo, tokenType, isGovernance, isTestnet, coinGeckoInfo, extraSignals } = params

    const scored = TokenSpam.score(name, symbol, logo)
    const signals = extraSignals?.length ? [...scored.signals, ...extraSignals] : scored.signals
    const spamScore = scored.spamScore + (extraSignals ?? []).reduce((sum, signal) => sum + signal.points, 0)

    if (isTestnet) {
      return { spamScore, isSpam: false, signals }
    }

    // logged after the testnet exit so the shadow review list only carries tokens that could
    // actually be marked
    if (config.SPAM_DETECTION.HOMOGLYPH_SHADOW) {
      const shadowSignals = signals.filter(signal => SHADOW_REASONS.has(signal.reason))
      if (shadowSignals.length) {
        logger.warn('Homoglyph shadow signal fired', llo({ name, symbol, signals: shadowSignals }))
      }
    }

    if (tokenType === ITokenType.escrowAdapter || isGovernance || tokenType === ITokenType.native) {
      return { spamScore, isSpam: false, signals }
    }

    if (spamScore >= TokenSpam.HARD_MARK_THRESHOLD) {
      return { spamScore, isSpam: true, signals }
    }

    if (spamScore === 0) {
      return { spamScore, isSpam: false, signals }
    }

    const hasCoinGeckoData = coinGeckoInfo?.priceUsd && parseFloat(coinGeckoInfo.priceUsd) > 0

    if (hasCoinGeckoData) {
      return { spamScore, isSpam: false, signals }
    }

    return { spamScore, isSpam: spamScore >= TokenSpam.MARK_THRESHOLD, signals }
  },
}

export default TokenSpam
