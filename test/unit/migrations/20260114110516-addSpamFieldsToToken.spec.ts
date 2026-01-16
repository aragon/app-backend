import { Models } from '@dbModels'
import logger from '@logger'
import addSpamFieldsToTokenMigration from '@src/migrations/20260114110516-addSpamFieldsToToken'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('migration: addSpamFieldsToToken', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
  })

  afterEach(async () => {
    sandbox.restore()
  })

  it('should update spam fields for tokens with spam-like names', async () => {
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

    await Models.Token.create({
      address: '0xSpamToken2',
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

    const updatedToken1 = await Models.Token.findOne({ address: '0xSpamToken1' })
    const updatedToken2 = await Models.Token.findOne({ address: '0xSpamToken2' })

    expect(updatedToken1?.isSpam).to.be.true
    expect(updatedToken1?.spamScore).to.be.gte(5)

    expect(updatedToken2?.spamScore).to.be.gte(1)
  })

  it('should not update tokens with valid logos', async () => {
    await Models.Token.create({
      address: '0xValidToken',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Valid Token',
      symbol: 'VALID',
      decimals: 18,
      logo: 'https://logo.com/valid.png',
      isGovernance: false,
      priceUsd: '1.5',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xValidToken' })

    expect(token?.isSpam).to.be.false
    expect(token?.spamScore).to.equal(0)
  })

  it('should skip testnet tokens', async () => {
    await Models.Token.create({
      address: '0xTestnetToken',
      network: NetworksEnum.ethereumSepolia,
      type: ITokenType.ERC20,
      name: 'Free Airdrop',
      symbol: 'SPAM',
      decimals: 18,
      logo: null,
      isGovernance: false,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xTestnetToken' })

    expect(token?.isSpam).to.be.false
    expect(token?.spamScore).to.equal(0)
  })

  it('should skip governance tokens', async () => {
    await Models.Token.create({
      address: '0xGovToken',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Free Airdrop',
      symbol: 'SPAM',
      decimals: 18,
      logo: null,
      isGovernance: true,
      priceUsd: '0',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xGovToken' })

    expect(token?.isSpam).to.be.false
    expect(token?.spamScore).to.equal(0)
  })

  it('should not mark as spam if token has valid price (CoinGecko data)', async () => {
    await Models.Token.create({
      address: '0xLegitToken',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      name: 'Airdrop Token',
      symbol: 'AIR',
      decimals: 18,
      logo: null,
      isGovernance: false,
      priceUsd: '1.5',
    })

    await addSpamFieldsToTokenMigration.start()

    const token = await Models.Token.findOne({ address: '0xLegitToken' })

    expect(token?.isSpam).to.be.false
    expect(token?.spamScore).to.be.gte(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await addSpamFieldsToTokenMigration.stop()
    })
  })
})
