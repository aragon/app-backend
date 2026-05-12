import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import fixCitreaTokenDecimalsMigration from '@src/migrations/20260512090000-fix-citrea-token-decimals'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: fix-citrea-token-decimals', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const createCitreaToken = async (overrides: Record<string, unknown>) =>
    Models.Token.create({
      network: NetworksEnum.citreaMainnet,
      type: ITokenType.ERC20,
      address: '0x0000000000000000000000000000000000000000',
      hasDecimals: true,
      decimals: 18,
      holders: 0,
      totalSupply: '0',
      priceUsd: '0',
      lastUpdatedAt: new Date(),
      ...overrides,
    })

  it('updates decimals when on-chain value differs', async () => {
    const ctusd = await createCitreaToken({
      address: '0x8D82c4E3c936C7B5724A382a9c5a4E6Eb7aB6d5D',
      symbol: 'CTUSD',
      decimals: 18,
    })

    sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(6)

    await fixCitreaTokenDecimalsMigration.start()

    const updated = await Models.Token.findOne({ address: ctusd.address })
    expect(updated?.decimals).to.equal(6)
  })

  it('leaves decimals unchanged when on-chain matches DB', async () => {
    const jucy = await createCitreaToken({
      address: '0x28CeBE1B35B04f9f39c42fC5CA80160C4608FA0B',
      symbol: 'JUCY',
      decimals: 18,
    })

    sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(18)

    await fixCitreaTokenDecimalsMigration.start()

    const updated = await Models.Token.findOne({ address: jucy.address })
    expect(updated?.decimals).to.equal(18)
  })

  it('skips tokens when on-chain read returns 0', async () => {
    const unknown = await createCitreaToken({
      address: '0x814B0538398596248B39e499262E6Cf53F276452',
      symbol: '',
      decimals: 18,
    })

    sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(0)

    await fixCitreaTokenDecimalsMigration.start()

    const after = await Models.Token.findOne({ address: unknown.address })
    expect(after?.decimals).to.equal(18)
  })

  it('skips native tokens', async () => {
    await createCitreaToken({
      address: '0x0000000000000000000000000000000000000000',
      type: ITokenType.native,
      symbol: 'BTC',
      decimals: 18,
    })

    const decimalsStub = sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(8)

    await fixCitreaTokenDecimalsMigration.start()

    expect(decimalsStub.called).to.be.false
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await fixCitreaTokenDecimalsMigration.stop()
      expect(true).to.be.true
    })
  })
})
