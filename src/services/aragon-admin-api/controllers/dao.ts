import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import { type IAVisibilityStatusParams } from '@src/types'
import { ErrorKeyEnum } from '@types'

const DaoAdminController = {
  setVisibilityStatus: async (params: IAVisibilityStatusParams): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    dao.isHidden = !params.status
    await dao.save()

    return true
  },
}

export default DaoAdminController
