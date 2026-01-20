import { Models } from '@dbModels'
import logger from '@logger'
import { SyncCmsSpamTokens } from '@services/aragon-rates/handlers/syncCmsSpamTokens'
import { ITokenType, NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonRates: SyncCmsSpamTokens', () => {
  let sandbox: SinonSandbox

  const spamTokenAddr = '0x1111111111111111111111111111111111111111'
  const falsePositiveAddr = '0x2222222222222222222222222222222222222222'
  const autoDetectedAddr = '0x3333333333333333333333333333333333333333'
  const ethSpamAddr = '0x4444444444444444444444444444444444444444'
  const polySpamAddr = '0x5555555555555555555555555555555555555555'
  const alreadySpamAddr = '0x6666666666666666666666666666666666666666'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should mark tokens as spam when in CMS list', async () => {
      const token = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: spamTokenAddr,
        name: 'Spam Token',
        symbol: 'SPAM',
        decimals: 18,
        isSpam: false,
        spamSource: null,
      })

      sandbox.stub(axios, 'get').resolves({
        data: {
          [NetworksEnum.ethereumMainnet]: [spamTokenAddr],
        },
      })
      sandbox.stub(logger, 'verbose')

      await SyncCmsSpamTokens.start()

      const updatedToken = await Models.Token.findByEntityId(token.id)
      expect(updatedToken?.isSpam).to.be.true
      expect(updatedToken?.spamSource).to.equal('cms')
    })

    it('should unmark tokens when removed from CMS list', async () => {
      const token = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: falsePositiveAddr,
        name: 'False Positive',
        symbol: 'FP',
        decimals: 18,
        isSpam: true,
        spamSource: 'cms',
      })

      sandbox.stub(axios, 'get').resolves({
        data: {
          [NetworksEnum.ethereumMainnet]: [],
        },
      })
      sandbox.stub(logger, 'verbose')

      await SyncCmsSpamTokens.start()

      const updatedToken = await Models.Token.findByEntityId(token.id)
      expect(updatedToken?.isSpam).to.be.false
      expect(updatedToken?.spamSource).to.be.null
    })

    it('should not unmark tokens marked by auto-detection', async () => {
      const token = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: autoDetectedAddr,
        name: 'Auto Detected Spam',
        symbol: 'ADS',
        decimals: 18,
        isSpam: true,
        spamSource: null,
      })

      sandbox.stub(axios, 'get').resolves({
        data: {
          [NetworksEnum.ethereumMainnet]: [],
        },
      })
      sandbox.stub(logger, 'verbose')

      await SyncCmsSpamTokens.start()

      const updatedToken = await Models.Token.findByEntityId(token.id)
      expect(updatedToken?.isSpam).to.be.true
      expect(updatedToken?.spamSource).to.be.null
    })

    it('should handle fetch errors gracefully', async () => {
      sandbox.stub(axios, 'get').rejects(new Error('Network error'))
      const loggerWarn = sandbox.stub(logger, 'warn')
      const loggerError = sandbox.stub(logger, 'error')

      await SyncCmsSpamTokens.start()

      expect(loggerError.calledWith('Error fetching CMS spam tokens' as any)).to.be.true
      expect(loggerWarn.calledWith('Failed to fetch CMS spam tokens data' as any)).to.be.true
    })

    it('should handle multiple networks', async () => {
      const ethToken = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: ethSpamAddr,
        name: 'ETH Spam',
        symbol: 'ETHS',
        decimals: 18,
        isSpam: false,
      })

      const polyToken = await Models.Token.create({
        network: NetworksEnum.polygonMainnet,
        type: ITokenType.ERC20,
        address: polySpamAddr,
        name: 'Poly Spam',
        symbol: 'POLYS',
        decimals: 18,
        isSpam: false,
      })

      sandbox.stub(axios, 'get').resolves({
        data: {
          [NetworksEnum.ethereumMainnet]: [ethSpamAddr],
          [NetworksEnum.polygonMainnet]: [polySpamAddr],
        },
      })
      sandbox.stub(logger, 'verbose')

      await SyncCmsSpamTokens.start()

      const updatedEthToken = await Models.Token.findByEntityId(ethToken.id)
      const updatedPolyToken = await Models.Token.findByEntityId(polyToken.id)

      expect(updatedEthToken?.isSpam).to.be.true
      expect(updatedEthToken?.spamSource).to.equal('cms')
      expect(updatedPolyToken?.isSpam).to.be.true
      expect(updatedPolyToken?.spamSource).to.equal('cms')
    })

    it('should skip updateMany when no tokens need updating', async () => {
      await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: alreadySpamAddr,
        name: 'Already Spam',
        symbol: 'AS',
        decimals: 18,
        isSpam: true,
        spamSource: 'cms',
      })

      sandbox.stub(axios, 'get').resolves({
        data: {
          [NetworksEnum.ethereumMainnet]: [alreadySpamAddr],
        },
      })
      sandbox.stub(logger, 'verbose')

      const updateManySpy = sandbox.spy(Models.Token, 'updateMany')

      await SyncCmsSpamTokens.start()

      expect(updateManySpy.called).to.be.false
    })
  })

  describe('buildTokenIds', () => {
    it('should build token IDs from network tokens', () => {
      const addr1 = '0x7777777777777777777777777777777777777777'
      const addr2 = '0x8888888888888888888888888888888888888888'
      const addr3 = '0x9999999999999999999999999999999999999999'

      const networkTokens = {
        [NetworksEnum.ethereumMainnet]: [addr1, addr2],
        [NetworksEnum.polygonMainnet]: [addr3],
      }

      const ids = SyncCmsSpamTokens.buildTokenIds(networkTokens)

      expect(ids).to.have.length(3)
      expect(ids[0]).to.include('ethereum-mainnet')
      expect(ids[1]).to.include('ethereum-mainnet')
      expect(ids[2]).to.include('polygon-mainnet')
    })

    it('should handle empty arrays', () => {
      const networkTokens = {
        [NetworksEnum.ethereumMainnet]: [],
      }

      const ids = SyncCmsSpamTokens.buildTokenIds(networkTokens)

      expect(ids).to.deep.equal([])
    })
  })
})
