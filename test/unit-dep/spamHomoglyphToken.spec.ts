import config from '@config'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Integ: Homoglyph spam token identification', () => {
  const network = NetworksEnum.ethereumMainnet
  const spoofs: Array<{ category: string; token: HexAddress; dao: HexAddress; symbol: string }> = [
    { category: 'Lisu symbol', token: '0xe4f3fC193d10917424Ce33312EfBBB997eE6F32A', dao: '0x51257b194EC39DED1B7f9c6C5797F7d19a939E96', symbol: 'ꓴꓢꓓꓚ' },
    { category: 'Lisu symbol', token: '0x235Ba04D98F2181894f5d69D9Cf27204D0D325cb', dao: '0xEC5bf80923Ff70730f03F2E863fa2A32A7A4BBd5', symbol: 'ꓴꓢꓓꓔ' },
    { category: 'Cyrillic symbol', token: '0x864389d15C554bb3E74f77f578d23e641D0F8782', dao: '0x89eFF21C0aF3dE4C87b8FB2074D3b0d5D1D75E24', symbol: 'ꓴꓢꓓС' },
    { category: 'Cyrillic symbol', token: '0xD7ddDa129d5eA340f0870C5d4b29cc0D9694DD91', dao: '0xD6Be91350974d08A95d608Cb667563059d1eFB2F', symbol: 'ꓴꓢꓓС' },
    { category: 'invisible chars', token: '0xD9a3679764855E03b6030db48aE36CEA8a2a7526', dao: '0x90b43E83ce5e82dd299a325C7D4Ac663164f6f1E', symbol: ' U5DТ ' },
    { category: 'invisible chars', token: '0x8B6D561B881d3FEaa47e6Bd34bFe74765b4B70a1', dao: '0x57e02115d5A3f91efCd21CC125C43E332a9219eF', symbol: ' ETHEREUM ' },
    { category: 'Greek/Armenian symbol', token: '0x6d0ad274d25F43827f2079B5F66b6730bFA82556', dao: '0x1538c293aC233B2cC489046240F37EDE06A0ae78', symbol: 'ՍՏⅮΤ' },
    { category: 'Greek/Lisu symbol', token: '0xD1d576c2d00AeB0E4C538F6331a22fd3B28E3e1e', dao: '0xC97bD2d3219511C4eB252Ec5124447674B83A784', symbol: 'ꓰꓔΗ' },
    { category: 'combining mark', token: '0x09061B97A1e7988e7143f59d055CfEFE7F8eb1D6', dao: '0xbC75aa00E3270c0057001e52000B6100801f000A', symbol: 'ĖTḨ' },
    { category: 'combining mark', token: '0xC0443fBDdf757533C4a109D41166e0F24d7691D9', dao: '0x7eCD6F7A6f42a83fA61269dFa2D02da2dfBb9AD6', symbol: 'ĖTḨ' },
    { category: 'Greek letter in name', token: '0xD89551D350532d001AD3105968FEcB24B1C3Cec8', dao: '0xB7460593BD222E24a2bF4393aa6416bD373995E0', symbol: 'ENCB' },
  ]

  let originalShadow: boolean

  before(() => {
    originalShadow = config.SPAM_DETECTION.HOMOGLYPH_SHADOW
    config.SPAM_DETECTION.HOMOGLYPH_SHADOW = false
  })

  after(() => {
    config.SPAM_DETECTION.HOMOGLYPH_SHADOW = originalShadow
  })

  describe('ProxyToken.saveAndGetToken', () => {
    for (const spoof of spoofs) {
      it(`marks the real ${spoof.category} token ${JSON.stringify(spoof.symbol)} as spam`, async function () {
        this.timeout(60000)

        const result = await ProxyToken.saveAndGetToken(spoof.token, network)

        // spam tokens are suppressed from callers
        expect(result, 'spam token should not be returned').to.be.null

        const saved = await Models.Token.findOne({ address: spoof.token, network })
        expect(saved, 'token row should exist').to.not.be.null
        expect(saved!.isSpam, 'isSpam').to.be.true
        expect(saved!.spamScore, 'spamScore').to.be.at.least(3)
      })
    }
  })

  describe('DaoAssets.syncToken after identification', () => {
    it('refuses a homoglyph token at the syncable gate and clears its asset row', async function () {
      this.timeout(60000)
      const { token, dao } = spoofs[0]

      await DaoAssets.syncToken({ daoAddress: dao, tokenAddress: token, network, skipMetrics: true })

      // the token never becomes a treasury asset
      const asset = await Models.Asset.findOne({ daoAddress: dao, tokenAddress: token, network })
      expect(asset, 'no asset row for a spam token').to.be.null
    })

    it('leaves a spam mark on any token row it did create during sync', async function () {
      this.timeout(60000)
      const { token, dao } = spoofs[2]

      await DaoAssets.syncToken({ daoAddress: dao, tokenAddress: token, network, skipMetrics: true })

      const saved = await Models.Token.findOne({ address: token, network })
      if (saved) {
        expect(saved.isSpam, 'if a row exists after sync it must be spam').to.be.true
      }
      const asset = await Models.Asset.findOne({ daoAddress: dao, tokenAddress: token, network })
      expect(asset, 'no asset row for a spam token').to.be.null
    })
  })
})
