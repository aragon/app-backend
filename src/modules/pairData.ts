import { Models } from '@dbModels'
import { type HexAddress, type IPaginationParams, type IPairParams, type NetworksEnum } from '@types'

const PairDataModule = {
  pairFromPaginationParams: async (paginationParams: IPaginationParams): Promise<IPaginationParams> => {
    // resolve ens from search
    if (paginationParams?.search && paginationParams?.search?.length > 0) {
      const searchStr = paginationParams.search
      const ethRegex = /\.eth$/

      if (ethRegex.test(searchStr)) {
        const member = await Models.Member.findByEns(searchStr as any)

        if (member) {
          paginationParams.search = member.address
        }
        // else {
        //   const address = await Web3Helper.getAddressFromEns(searchStr, NetworksEnum.ethereumMainnet)
        //
        //   if (address) {
        //     const memberDb = await Models.Member.findByAddress(searchStr as any)
        //
        //     if (memberDb) {
        //       await memberDb.update({ ens: searchStr })
        //       paginationParams.search = memberDb.address
        //     }
        //   }
        // }
      }
    }

    return paginationParams
  },

  pairFromExtraParams: async <
    T extends { network?: NetworksEnum; daoAddress?: HexAddress; memberAddress?: HexAddress },
  >(
    extraParams: T,
    pairParams: IPairParams,
  ): Promise<T> => {
    // resolve daoId
    if (pairParams?.daoId) {
      const daoDb = await Models.Dao.findByEntityId(pairParams.daoId)
      if (daoDb) {
        extraParams.network = daoDb.network
        extraParams.daoAddress = daoDb.address
      }
    }

    // resolve ens
    if (pairParams?.ens) {
      const memberDb = await Models.Member.findByEns(pairParams.ens as any)
      if (memberDb) {
        extraParams.memberAddress = memberDb.address
      }
    }

    return extraParams
  },
}
export default PairDataModule
