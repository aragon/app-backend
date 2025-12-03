import { Models } from '@dbModels'
import { type IGetPoliciesByDaoParams } from '@types'

const PolicyController = {
  getPoliciesByDao: async (params: IGetPoliciesByDaoParams) => {
    const { daoAddress, network, onlyParent } = params

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    if (dao?.subDaos?.length && !onlyParent) {
      params.daoAddresses = [daoAddress, ...dao.subDaos]
    }

    return await Models.Plugin.findPoliciesByDao(params)
  },
}

export default PolicyController
