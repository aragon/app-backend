import { Models } from '@dbModels'
import { type IGetPoliciesByDaoParams } from '@types'

const PolicyController = {
  getPoliciesByDao: async (params: IGetPoliciesByDaoParams) => {
    const { daoAddress, network, onlyParent } = params

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    if (dao?.linkedAccounts?.length && !onlyParent) {
      params.daoAddresses = [daoAddress, ...dao.linkedAccounts]
    }

    return await Models.Plugin.findPoliciesByDao(params)
  },
}

export default PolicyController
