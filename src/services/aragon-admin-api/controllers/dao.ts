import { type IAVisibilityStatusParams } from '@src/types'
import { Models } from '@dbModels'
import { ErrorKeyEnum } from '@types'
import { assertExposable } from '@errors'

const QueueAdminController = {
  setVisibilityStatus: async (params: IAVisibilityStatusParams): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    await dao.save({ isHidden: !params.status })

    return true
  },
}

export default QueueAdminController
