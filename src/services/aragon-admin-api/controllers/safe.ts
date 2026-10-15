import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import { EnumQueueName, ErrorKeyEnum, ISafeReadKind, type IQueueSafeTrack } from '@types'

const SafeAdminController = {
  add: async ({ network, address }: IQueueSafeTrack): Promise<true> => {
    // Throws for a non-Safe or a chain with no Safe service, before anything is written.
    await SafeReadRequestModule.send({ sentAt: Date.now(), network, address, kind: ISafeReadKind.info })

    await Models.SafeAccount.track(network, address)
    await RabbitMQHelper.sendMessage(EnumQueueName.safeTrack, {
      id: `safe-track-${network}-${address}`,
      params: { network, address },
    })

    return true
  },

  remove: async ({ network, address }: IQueueSafeTrack): Promise<true> => {
    assertExposable(
      !(await SafeBodyMembersModule.isTracked(address, network)),
      ErrorKeyEnum.badParams,
      400,
      'The Safe belongs to a DAO or SPP, only a custom Safe can be removed',
    )
    assertExposable(await Models.SafeAccount.untrack(network, address), ErrorKeyEnum.notFound)
    return true
  },
}

export default SafeAdminController
