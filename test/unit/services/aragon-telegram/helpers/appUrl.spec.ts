import config from '@config'
import { daoAppUrl } from '@services/aragon-telegram/commands/util'
import {
  appBaseUrl,
  appCodeFromUrl,
  isAppUrl,
  knownAppCode,
  parseAppUrls,
} from '@services/aragon-telegram/helpers/appUrl'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { getConfigObject } from '../../../../../config/common'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const DEFAULT_URL = 'https://app.aragon.org'
const OCC_URL = 'https://new.app.aragon.org'

describe('AragonTelegram: appUrl', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(config.SERVICES.ARAGON_TELEGRAM, 'APP_BASE_URL').value(DEFAULT_URL)
    sandbox.stub(config.SERVICES.ARAGON_TELEGRAM, 'APP_URLS').value([`o=${OCC_URL}`])
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('parseAppUrls', () => {
    const fromEnv = (env: Record<string, string>) =>
      parseAppUrls(getConfigObject(env).SERVICES.ARAGON_TELEGRAM.APP_URLS)

    it('maps the OCC code to its host by default and keeps the default app URL', () => {
      expect(fromEnv({})).to.deep.eq({ o: OCC_URL })
      expect(getConfigObject({}).SERVICES.ARAGON_TELEGRAM.APP_BASE_URL).to.eq(DEFAULT_URL)
    })

    it('reads `<code>=<url>` pairs from the environment', () => {
      expect(
        fromEnv({ SERVICES_ARAGON_TELEGRAM_APP_URLS: 'o=https://occ.stg.example/, p=http://localhost:3000' }),
      ).to.deep.eq({
        o: 'https://occ.stg.example',
        p: 'http://localhost:3000',
      })
    })

    it('trims whitespace around the code and the URL', () => {
      expect(parseAppUrls([' o = https://occ.example '])).to.deep.eq({ o: 'https://occ.example' })
    })

    it('falls back to the default for an empty value', () => {
      expect(fromEnv({ SERVICES_ARAGON_TELEGRAM_APP_URLS: '' })).to.deep.eq({ o: OCC_URL })
    })

    it('disables the alternate apps with `none`', () => {
      expect(fromEnv({ SERVICES_ARAGON_TELEGRAM_APP_URLS: 'none' })).to.deep.eq({})
    })

    it('drops malformed entries and the codes reserved for callback actions', () => {
      expect(
        parseAppUrls([
          'O=https://upper.example',
          'oo=https://long.example',
          's=https://s.example',
          'q=https://q.example',
          'x=https://x.example',
          'a=ftp://a.example',
          'b=https://b.example/path',
          'c=',
          'd',
          'e=https://e.example',
        ]),
      ).to.deep.eq({ e: 'https://e.example' })
    })

    it('rejects query strings, fragments and userinfo, and still accepts a trailing slash', () => {
      expect(
        parseAppUrls([
          'a=https://a.example?x=1',
          'b=https://b.example/?x=1',
          'c=https://c.example#f',
          'd=https://user@d.example',
          'e=https://evil@new.app.aragon.org',
          'f=https://f.example/',
        ]),
      ).to.deep.eq({ f: 'https://f.example' })
    })
  })

  describe('knownAppCode', () => {
    it('keeps a configured code and drops anything else', () => {
      expect(knownAppCode('o')).to.eq('o')
      expect(knownAppCode('z')).to.be.undefined
      expect(knownAppCode('')).to.be.undefined
      expect(knownAppCode(undefined)).to.be.undefined
      expect(knownAppCode('constructor')).to.be.undefined
      expect(knownAppCode('__proto__')).to.be.undefined
    })
  })

  describe('appBaseUrl', () => {
    it('selects from the allowlist and falls back to the default app', () => {
      expect(appBaseUrl()).to.eq(DEFAULT_URL)
      expect(appBaseUrl('o')).to.eq(OCC_URL)
      expect(appBaseUrl('z')).to.eq(DEFAULT_URL)
    })

    it('falls back to the default app once the alternate app is disabled', () => {
      sandbox.stub(config.SERVICES.ARAGON_TELEGRAM, 'APP_URLS').value([])
      expect(appBaseUrl('o')).to.eq(DEFAULT_URL)
    })
  })

  describe('daoAppUrl', () => {
    it('links to the app behind the ref', () => {
      const ref = { network: NetworksEnum.ethereumSepolia, daoAddress: DAO }
      expect(daoAppUrl(ref)).to.eq(`${DEFAULT_URL}/dao/ethereum-sepolia/${DAO}`)
      expect(daoAppUrl({ ...ref, appCode: 'o' })).to.eq(`${OCC_URL}/dao/ethereum-sepolia/${DAO}`)
      expect(daoAppUrl({ ...ref, appCode: 'z' })).to.eq(`${DEFAULT_URL}/dao/ethereum-sepolia/${DAO}`)
    })
  })

  describe('appCodeFromUrl', () => {
    it('matches only the exact origin of a configured alternate app', () => {
      expect(appCodeFromUrl(`${OCC_URL}/dao/ethereum-sepolia/${DAO}`)).to.eq('o')
      expect(appCodeFromUrl(`  ${OCC_URL}/dao/x`)).to.eq('o')
      expect(appCodeFromUrl(`${DEFAULT_URL}/dao/x`)).to.be.undefined
      expect(appCodeFromUrl(`https://evil.example/dao/x`)).to.be.undefined
      expect(appCodeFromUrl(`https://new.app.aragon.org.evil.example/dao/x`)).to.be.undefined
      expect(appCodeFromUrl(`https://evil.example/?u=${OCC_URL}`)).to.be.undefined
      expect(appCodeFromUrl(`http://new.app.aragon.org/dao/x`)).to.be.undefined
      expect(appCodeFromUrl('new.app.aragon.org/dao/x')).to.be.undefined
      expect(appCodeFromUrl('not a url')).to.be.undefined
    })
  })

  describe('isAppUrl', () => {
    it('is true for the default app and the alternate apps, false for any other host', () => {
      expect(isAppUrl(`${DEFAULT_URL}/dao/x`)).to.be.true
      expect(isAppUrl(`${OCC_URL}/dao/x`)).to.be.true
      expect(isAppUrl('https://evil.example/dao/x')).to.be.false
      expect(isAppUrl('ethereum-sepolia-0x0')).to.be.false
    })
  })
})
