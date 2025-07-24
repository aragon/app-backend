import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Models } from '@dbModels'
import { expect } from 'chai'
import migrationTokenHasClockMode from '@src/migrations/20250627144557-tokenHasClockMode'
import { IClockMode, NetworksEnum } from '@types'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import GovernanceVeHelper from '@helpers/governanceVe'

describe('migration: migrateTokenConfigIndexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('migrationTokenHasClockMode', () => {
    it('should migrate token has clock mode', async () => {
      const dbTokenData = [
        {
          id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x81e8037e8b29b0faf09a7a8e024c3ebb87b2ca32bf628b591e870639c44655f5',
          blockNumber: 8575352,
          type: 'escrowAdapter',
          address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          mintableByDao: false,
          implementationAddress: '0x30005E2beebbFcE6ec94556ff43780d47cD68F90',
          logo: null,
          skipFetchRate: true,
          isGovernance: true,
          name: null,
          symbol: null,
          decimals: 18,
          underlying: null,
          holders: 0,
          totalSupply: '0',
          priceUsd: '0',
          hasDelegate: true,
          hasBalanceOfERC20: true,
          hasBalanceOfERC777: false,
          hasName: false,
          hasSymbol: false,
          hasDecimals: false,
          hasTotalSupply: false,
          refetch: false,
        },
      ]

      await Promise.all(dbTokenData.map(async data => Models.Token.create(data)))

      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode').resolves(IClockMode.BlockNumber)
      const stubGetUnderlying = sandbox.stub(GovernanceVeHelper, 'getUnderlyingTokenNameAndSymbol').resolves({
        name: 'Test Token',
        symbol: 'TEST',
        underlying: '0x1234567890abcdef1234567890abcdef12345678',
      })

      await migrationTokenHasClockMode.start()

      expect(stubGetClockMode.calledOnceWith(dbTokenData[0].address, dbTokenData[0].network)).to.be.true
      expect(stubGetUnderlying.calledOnceWith(dbTokenData[0].address, dbTokenData[0].network)).to.be.true

      const token = await Models.Token.findOne({ address: dbTokenData[0].address }).lean().exec()
      expect(token).to.exist
      expect(token.name).to.eq('Test Token')
      expect(token.symbol).to.eq('TEST')
      expect(token.underlying).to.eq('0x1234567890abcdef1234567890abcdef12345678')
    })
  })
})
