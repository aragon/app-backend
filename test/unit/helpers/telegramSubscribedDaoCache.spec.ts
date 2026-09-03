import config from '@config'
import { Models } from '@dbModels'
import TelegramSubscribedDaoCache from '@helpers/telegramSubscribedDaoCache'
import { type HexAddress, ITelegramSubscriptionStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const OTHER = '0x000000000000000000000000000000000000dEaD' as HexAddress
const NETWORK = NetworksEnum.ethereumSepolia

const subscribe = async (
  telegramUserId: number,
  daoAddress: HexAddress,
  status = ITelegramSubscriptionStatus.Active,
) => {
  const sub = await Models.TelegramSubscription.create({ telegramUserId, chatId: telegramUserId, status })
  await sub.addDaoSubscription({ network: NETWORK, daoAddress })
}

const isSubscribed = async (daoAddress: HexAddress) => {
  await TelegramSubscribedDaoCache.refresh()
  return TelegramSubscribedDaoCache.has(NETWORK, daoAddress)
}

describe('Helper: TelegramSubscribedDaoCache', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    TelegramSubscribedDaoCache.reset()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('knows an organization with an active subscriber and not one without', async () => {
    await subscribe(1, DAO)

    expect(await isSubscribed(DAO)).to.be.true
    expect(await isSubscribed(OTHER)).to.be.false
  })

  it('ignores subscribers who are paused or blocked', async () => {
    await subscribe(1, DAO, ITelegramSubscriptionStatus.Paused)
    await subscribe(2, OTHER, ITelegramSubscriptionStatus.Blocked)

    expect(await isSubscribed(DAO)).to.be.false
    expect(await isSubscribed(OTHER)).to.be.false
  })

  it('serves the loaded set until the TTL passes, then picks up new subscribers', async () => {
    const clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    expect(await isSubscribed(DAO)).to.be.false

    await subscribe(1, DAO)
    expect(await isSubscribed(DAO)).to.be.false

    clock.tick(config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS + 1)
    expect(await isSubscribed(DAO)).to.be.true
  })

  it('reads the database once per TTL no matter how many lookups happen', async () => {
    const distinct = sandbox.spy(Models.TelegramSubscription, 'distinct')

    await isSubscribed(DAO)
    await isSubscribed(OTHER)
    expect(distinct.callCount).to.eq(1)
  })

  it('keeps the previous set when a reload fails', async () => {
    const clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    await subscribe(1, DAO)
    expect(await isSubscribed(DAO)).to.be.true

    sandbox.stub(Models.TelegramSubscription, 'distinct').rejects(new Error('mongo unavailable'))
    clock.tick(config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS + 1)

    expect(await isSubscribed(DAO)).to.be.true
  })

  it('drops the result of a load that was in flight when reset was called', async () => {
    await subscribe(1, DAO)
    let finishLoad: (daoIds: string[]) => void = () => {}
    sandbox.stub(Models.TelegramSubscription, 'distinct').returns(
      new Promise<string[]>(resolve => {
        finishLoad = resolve
      }) as any,
    )

    const staleLoad = TelegramSubscribedDaoCache.refresh()
    TelegramSubscribedDaoCache.reset()
    finishLoad([Models.TelegramSubscription.getDaoId({ network: NETWORK, daoAddress: DAO })])
    await staleLoad

    expect(TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.false
    sandbox.restore()
    expect(await isSubscribed(DAO)).to.be.true
  })
})
