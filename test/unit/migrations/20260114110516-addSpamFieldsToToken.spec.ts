import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import logger from '@logger'
import addSpamFieldsToTokenMigration from '@src/migrations/20260114110516-addSpamFieldsToToken'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('migration: addSpamFieldsToToken', () => {
  let sandbox: sinon.SinonSandbox
  let coinGeckoStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    coinGeckoStub = sandbox.stub(CoinGeckoHelper, 'getToken')
  })

  afterEach(async () => {
    sandbox.restore()
  })

  it('should update spam fields for tokens with spam-like names when CoinGecko returns no data', async () => {
    coinGeckoStub.resolves(false)

    await Models.Token.create({
      address: '0xSpamToken1',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Free Airdrop https://scam.com',
      symbol: 'SPAM',
      decimals: 18,
      logo: null,
      isGovernance: false,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const updatedToken1 = await Models.Token.findOne({ address: '0xSpamToken1' })

    expect(updatedToken1?.isSpam).to.be.true
    expect(updatedToken1?.spamScore).to.be.gte(5)
  })

  it('should not mark as spam if CoinGecko returns valid price', async () => {
    coinGeckoStub.resolves({
      address: '0xLegitToken',
      network: NetworksEnum.ethereumMainnet,
      logo: 'https://coingecko.com/logo.png',
      priceUsd: '1.5',
      name: 'Airdrop Token',
    })

    await Models.Token.create({
      address: '0xLegitToken',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Airdrop Token',
      symbol: 'AIR',
      decimals: 18,
      logo: null,
      isGovernance: false,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xLegitToken' })

    expect(token?.isSpam).to.be.false
    expect(token?.logo).to.equal('https://coingecko.com/logo.png')
    expect(token?.priceUsd).to.equal('1.5')
  })

  it('should update logo from CoinGecko when available for token with spam indicators', async () => {
    coinGeckoStub.resolves({
      address: '0xTokenWithLogo',
      network: NetworksEnum.ethereumMainnet,
      logo: 'https://coingecko.com/new-logo.png',
      priceUsd: '0',
      name: 'Claim Token',
    })

    await Models.Token.create({
      address: '0xTokenWithLogo',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Claim Token',
      symbol: 'CLM',
      decimals: 18,
      logo: null,
      isGovernance: false,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xTokenWithLogo' })

    // Token has spam indicator ('claim') but CoinGecko provides logo
    expect(token?.logo).to.equal('https://coingecko.com/new-logo.png')
    expect(token?.spamScore).to.be.gte(1)
  })

  it('should mark as spam when CoinGecko returns no data and token has spam indicators', async () => {
    coinGeckoStub.resolves(false)

    await Models.Token.create({
      address: '0xBonusToken',
      network: NetworksEnum.polygonMainnet,
      type: ITokenType.ERC20,
      name: 'Claim your bonus',
      symbol: 'BONUS',
      decimals: 18,
      logo: '',
      isGovernance: false,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xBonusToken' })

    expect(token?.spamScore).to.be.gte(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await addSpamFieldsToTokenMigration.stop()
    })
  })
})
