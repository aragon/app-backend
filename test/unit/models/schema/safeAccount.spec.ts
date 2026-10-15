import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x1111111111111111111111111111111111111111'
const OTHER_SAFE = '0x2222222222222222222222222222222222222222'

describe('Model: SafeAccount', () => {
  it('leaves a new sync account untracked with no creation block', async () => {
    const account = await Models.SafeAccount.ensure(NETWORK, SAFE)

    expect(account.tracked).to.be.false
    expect(account.blockNumber).to.be.null
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
  })

  it('keeps sync progress when a Safe is registered again', async () => {
    const queueFetchedAt = new Date('2026-10-15T00:00:00Z')
    const historyFetchedAt = new Date('2026-10-15T00:01:00Z')
    await Models.SafeAccount.create({
      id: Models.SafeAccount.buildId(NETWORK, SAFE),
      network: NETWORK,
      safeAddress: SAFE,
      queueFetchedAt,
      historyFetchedAt,
      queueComplete: true,
      blockNumber: 123,
    })

    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.ensure(NETWORK, SAFE)
    expect(await Models.SafeAccount.untrack(NETWORK, SAFE)).to.be.true
    const account = await Models.SafeAccount.track(NETWORK, SAFE)

    expect(await Models.SafeAccount.countDocuments()).to.equal(1)
    expect(account).to.include({
      network: NETWORK,
      safeAddress: SAFE,
      tracked: true,
      blockNumber: 123,
      queueComplete: true,
    })
    expect(account.queueFetchedAt).to.deep.equal(queueFetchedAt)
    expect(account.historyFetchedAt).to.deep.equal(historyFetchedAt)
  })

  it('removes only an active registration and keeps the account row', async () => {
    expect(await Models.SafeAccount.untrack(NETWORK, SAFE)).to.be.false
    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    await Models.SafeAccount.track(NETWORK, SAFE)

    expect(await Models.SafeAccount.untrack(NETWORK, SAFE)).to.be.true
    expect(await Models.SafeAccount.untrack(NETWORK, SAFE)).to.be.false
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
    expect(await Models.SafeAccount.findOne({ id: Models.SafeAccount.buildId(NETWORK, SAFE) })).to.include({
      safeAddress: SAFE,
      tracked: false,
    })
  })

  it('lists only registered Safes on the requested network', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.track(NETWORK, OTHER_SAFE)
    await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, OTHER_SAFE)
    await Models.SafeAccount.untrack(NETWORK, OTHER_SAFE)

    expect((await Models.SafeAccount.findAllTracked(NETWORK)).map(row => row.safeAddress)).to.deep.equal([SAFE])
    expect(
      (await Models.SafeAccount.findAllTracked(NetworksEnum.ethereumMainnet)).map(row => row.safeAddress),
    ).to.deep.equal([OTHER_SAFE])
    expect(await Models.SafeAccount.findTracked(NetworksEnum.ethereumMainnet, SAFE)).to.be.null
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.include({ tracked: true, safeAddress: SAFE })
  })
})
