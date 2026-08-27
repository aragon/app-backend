import { Models } from '@dbModels'
import { removeDaoSubscriptionAndCleanUp } from '@services/aragon-telegram/helpers/userData'
import { telegramRecipientHash } from '@services/aragon-telegram/helpers/userHash'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'

const TG_USER_ID = 100
const OTHER_TG_USER_ID = 200
const DAO_A = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const DAO_B = '0xA1cB1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

describe('AragonTelegram: userData', () => {
  it('deletes recipient-specific delivery markers when the final DAO is removed', async () => {
    const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
    await sub.addDaoSubscription({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO_A })
    await Models.TelegramNotifiedEvent.claim('delivery:owner', telegramRecipientHash(TG_USER_ID))
    await Models.TelegramNotifiedEvent.claim('delivery:other', telegramRecipientHash(OTHER_TG_USER_ID))

    const deletedUserData = await removeDaoSubscriptionAndCleanUp(
      sub,
      { network: NetworksEnum.ethereumSepolia, daoAddress: DAO_A },
      TG_USER_ID,
    )

    expect(deletedUserData).to.be.true
    expect(await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)).to.be.null
    expect(await Models.TelegramNotifiedEvent.exists({ id: 'delivery:owner' })).to.be.null
    expect(await Models.TelegramNotifiedEvent.exists({ id: 'delivery:other' })).to.not.be.null
  })

  it('keeps delivery markers while other DAO subscriptions remain', async () => {
    const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
    await sub.addDaoSubscription({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO_A })
    await sub.addDaoSubscription({ network: NetworksEnum.ethereumMainnet, daoAddress: DAO_B })
    await Models.TelegramNotifiedEvent.claim('delivery:owner', telegramRecipientHash(TG_USER_ID))

    const deletedUserData = await removeDaoSubscriptionAndCleanUp(
      sub,
      { network: NetworksEnum.ethereumSepolia, daoAddress: DAO_A },
      TG_USER_ID,
    )

    expect(deletedUserData).to.be.false
    expect(await Models.TelegramNotifiedEvent.exists({ id: 'delivery:owner' })).to.not.be.null
  })
})
