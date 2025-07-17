import { Models } from '@dbModels'
import {
  type HexAddress,
  type IExtraQueryData,
  type IPaginationParams,
  type IPairParams,
  IPluginStatus,
  type NetworksEnum,
} from '@types'

const PairDataModule = {
  pairExtraQueryData: async <
    T extends {
      pluginAddress?: HexAddress
    },
  >(
    extraParams: T,
  ): Promise<IExtraQueryData> => {
    const extraQueryData: IExtraQueryData = {}

    if (extraParams.pluginAddress) {
      const plugin = await Models.Plugin.findOne({ address: extraParams.pluginAddress })
      extraQueryData.daoAddresses = plugin?.daoAddress ? [plugin.daoAddress] : []
    }

    return extraQueryData
  },

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

  checkIFEns: async (searchStr: string): Promise<HexAddress> => {
    const ifEns = searchStr.match(/\.eth$/)
    if (ifEns) {
      const member = await Models.Member.findByEns(searchStr as any)
      if (member) {
        return member.address
      }
    }

    return searchStr
  },

  pairFromExtraParams: async <
    T extends {
      network?: NetworksEnum
      daoAddress?: HexAddress
      memberAddress?: HexAddress
      pluginAddress?: HexAddress
      tokenAddress?: HexAddress
      pluginAddresses?: HexAddress[]
      proposalIndex?: string
    },
  >(
    extraParams: T,
    pairParams?: IPairParams,
  ): Promise<T> => {
    // resolve daoId
    if (pairParams?.daoId) {
      const daoDb = await Models.Dao.findByEntityId(pairParams.daoId)
      if (daoDb) {
        extraParams.network = daoDb.network
        extraParams.daoAddress = daoDb.address

        if (pairParams?.onlyActive) {
          extraParams.pluginAddresses = await Models.Plugin.distinct('address', {
            daoAddress: daoDb.address,
            network: daoDb.network,
            status: IPluginStatus.installed,
          })
        }
      }
    }

    // resolve ens
    if (pairParams?.ens) {
      const memberDb = await Models.Member.findByEns(pairParams.ens as any)
      if (memberDb) {
        extraParams.memberAddress = memberDb.address
      }
    }

    if (pairParams?.proposalId) {
      const proposal = await Models.Proposal.findByEntityId(pairParams.proposalId)
      if (proposal) {
        extraParams.pluginAddress = proposal.pluginAddress
        extraParams.proposalIndex = proposal.proposalIndex
      }
    }

    // TODO: token may be attached to multiple plugins
    if (extraParams?.tokenAddress) {
      const plugin = await Models.Plugin.findByTokenAddress(extraParams.tokenAddress, extraParams.network!)
      if (plugin) {
        extraParams.pluginAddress = plugin.address
      }
    }

    return extraParams
  },

  async pairFromDaoMemberMapping({
    network,
    pluginAddress,
    tokenAddress,
    memberAddress,
  }: {
    pluginAddress?: HexAddress
    tokenAddress?: HexAddress
    memberAddress?: HexAddress
    network?: NetworksEnum
  }) {
    const params: any = {}

    if (tokenAddress) {
      params.tokenAddress = tokenAddress
    }

    if (!tokenAddress && pluginAddress) {
      params.pluginAddress = pluginAddress
    }

    if (memberAddress) {
      params.memberAddress = memberAddress
    }

    if (network) {
      params.network = network
    }

    if (Object.keys(params).length > 0) {
      const mappings = (await Models.DaoMemberMapping.find(params)) || []
      return mappings
    }

    return []
  },
}
export default PairDataModule
