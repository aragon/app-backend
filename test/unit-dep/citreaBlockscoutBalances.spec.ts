import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import MongoDB from '@modules/mongo'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

// Integration test for the Citrea token-balance source. Alchemy's Enhanced
// API (`alchemy_getTokenBalances`) is disabled on Citrea by Alchemy itself
// (`-32600 EAPIs not enabled on specified network: [CITREA_MAINNET]`), so
// we fetch balances via Blockscout's REST v2 endpoint instead.
//
// This hits the real Citrea Blockscout API. Run with:
//   DOTENV_CONFIG_PATH=.env.unit-deep yarn test:unit-dep -g "Blockscout"
describe.only('Integration: Citrea Blockscout token balances', () => {
  let dropStub: sinon.SinonStub

  // Same stub used by daoTransaction.spec.ts — the global beforeEach drops
  // every collection, which times out against a production-like DB. This
  // test doesn't touch Mongo at all, but the drop fires regardless.
  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  it('returns the JUCY ERC20 balance for DAO 0x10FD… via Blockscout v2', async function () {
    this.timeout(60_000)

    const daoAddress = '0x10FD1a9E6aA2635bAED729A4f4a1f43e470C6dB2'
    const expectedJucyToken = '0x28CeBE1B35B04f9f39c42fC5CA80160C4608FA0B'

    const balances = await evmExplorerClient.getTokenBalances(
      EvmExplorerEnum.BLOCKSCOUT,
      daoAddress,
      NetworksEnum.citreaMainnet,
    )

    console.log(`Blockscout returned ${balances.length} token balance row(s):`)
    balances.forEach((b: any, i: number) => {
      console.log(
        `  ${i + 1}. addr=${b.contractAddress} name=${b.name} symbol=${b.symbol} ` +
          `decimals=${b.decimals} balance=${b.tokenBalance} raw=${b.originalBalance} ` +
          `priceUsd=${b.priceUsd ?? 'n/a'}`,
      )
    })

    expect(balances, 'Blockscout must return an array').to.be.an('array')
    expect(balances.length, 'Blockscout must return at least one balance row').to.be.at.least(1)

    const jucy = balances.find((b: any) => b.contractAddress?.toLowerCase() === expectedJucyToken.toLowerCase())
    expect(jucy, 'JUCY balance row must be present for the DAO').to.exist
    expect(jucy!.symbol, 'JUCY symbol must be populated').to.equal('JUCY')
    expect(jucy!.name, 'JUCY name must be populated').to.be.a('string').and.not.empty
    expect(jucy!.decimals, 'JUCY decimals must be 18').to.equal(18)
    expect(jucy!.originalBalance, 'JUCY raw balance must be the 5e18 deposit').to.equal('5000000000000000000')
    expect(jucy!.tokenBalance, 'JUCY parsed balance must be non-zero').to.not.equal('0')

    console.log(`\n✓ Blockscout v2 is a viable token-balance source for Citrea`)
  })
})
