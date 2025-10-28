import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum, type IPaginationParams } from '@types'

const PermissionController = {
  getPermissionsByDao: async (daoAddress: HexAddress, network: NetworksEnum, paginationParams: IPaginationParams) => {
    return await Models.DaoPermission.findWithPagination({
      extraParams: { daoAddress, network },
      paginationParams,
    })
  },
}

export default PermissionController
