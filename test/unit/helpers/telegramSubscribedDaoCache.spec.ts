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

    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.true
    expect(await TelegramSubscribedDaoCache.has(NETWORK, OTHER)).to.be.false
  })

  it('ignores subscribers who are paused or blocked', async () => {
    await subscribe(1, DAO, ITelegramSubscriptionStatus.Paused)
    await subscribe(2, OTHER, ITelegramSubscriptionStatus.Blocked)

    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.false
    expect(await TelegramSubscribedDaoCache.has(NETWORK, OTHER)).to.be.false
  })

  it('serves the loaded set until the TTL passes, then picks up new subscribers', async () => {
    const clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.false

    await subscribe(1, DAO)
    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.false

    clock.tick(config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS + 1)
    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.true
  })

  it('keeps the previous set when a reload fails', async () => {
    const clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    await subscribe(1, DAO)
    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.true

    sandbox.stub(Models.TelegramSubscription, 'distinct').rejects(new Error('mongo unavailable'))
    clock.tick(config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS + 1)

    expect(await TelegramSubscribedDaoCache.has(NETWORK, DAO)).to.be.true
  })
})
