import { Models } from '@dbModels'
import releaseGovernanceTokensFetchRateMigration from '@src/migrations/20260803193151-releaseGovernanceTokensFetchRate'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: release governance tokens from skipFetchRate', () => {
  it('releases stuck governance tokens while leaving disqualified ones skipped', async () => {
    const base = {
      network: NetworksEnum.baseMainnet,
      type: ITokenType.ERC20,
      skipFetchRate: true,
      isGovernance: true,
      fetchRateFailCount: 3,
      nextFetchRateAt: new Date('2026-01-01'),
    }

    await Models.Token.collection.insertMany([
      // Externally deployed governance token with a symbol and known type
      { ...base, id: 'external-gov', address: '0xaaa', symbol: 'DEUS', mintableByDao: false },
      // Aragon-minted governance token - can get listed later, released as well
      { ...base, id: 'dao-minted-gov', address: '0xbbb', symbol: 'GOV', mintableByDao: true },
      // Disqualified variants - must stay skipped
      { ...base, id: 'no-symbol', address: '0xccc', symbol: null, mintableByDao: false },
      { ...base, id: 'unknown-type', address: '0xddd', symbol: 'UNK', mintableByDao: false, type: ITokenType.unknown },
      { ...base, id: 'spam', address: '0xeee', symbol: 'SPM', mintableByDao: false, isSpam: true },
      {
        ...base,
        id: 'testnet',
        address: '0xfff',
        symbol: 'TST',
        mintableByDao: false,
        network: NetworksEnum.ethereumSepolia,
      },
      // Non-governance skipped token - out of scope, must stay untouched
      { ...base, id: 'non-gov', address: '0x111', symbol: 'TKN', isGovernance: false, mintableByDao: false },
    ])

    await releaseGovernanceTokensFetchRateMigration.start()

    const released = await Models.Token.collection
      .find({ id: { $in: ['external-gov', 'dao-minted-gov'] } })
      .project({ id: 1, skipFetchRate: 1, fetchRateFailCount: 1, nextFetchRateAt: 1 })
      .toArray()
    expect(released).to.have.lengthOf(2)
    for (const token of released) {
      expect(token.skipFetchRate, token.id).to.equal(false)
      expect(token.fetchRateFailCount, token.id).to.equal(0)
      expect(token.nextFetchRateAt, token.id).to.equal(null)
    }

    const stillSkipped = await Models.Token.collection
      .find({ id: { $nin: ['external-gov', 'dao-minted-gov'] } })
      .project({ id: 1, skipFetchRate: 1, fetchRateFailCount: 1 })
      .toArray()
    expect(stillSkipped).to.have.lengthOf(5)
    for (const token of stillSkipped) {
      expect(token.skipFetchRate, token.id).to.equal(true)
      expect(token.fetchRateFailCount, token.id).to.equal(3)
    }
  })

  it('completes cleanly when there is nothing to release', async () => {
    await Models.Token.collection.insertOne({
      id: 'unknown-type-gov',
      address: '0xbbb',
      network: NetworksEnum.baseMainnet,
      type: ITokenType.unknown,
      symbol: 'GOV',
      skipFetchRate: true,
      isGovernance: true,
    })

    await releaseGovernanceTokensFetchRateMigration.start()

    const token = await Models.Token.collection.findOne({ id: 'unknown-type-gov' })
    expect(token!.skipFetchRate).to.equal(true)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await releaseGovernanceTokensFetchRateMigration.stop()
      expect(true).to.be.true
    })
  })
})
