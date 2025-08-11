import { Models } from '@dbModels'
import {
  type HexAddress,
  type IAggDaoMemberMappingParams,
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

    if (extraParams?.tokenAddress) {
      const plugin = await Models.Plugin.findByTokenAddress(extraParams.tokenAddress, extraParams.network!)
      if (plugin) {
        extraParams.pluginAddress = plugin.address
      }
    }

    return extraParams
  },

  async pairAllMemberOfDao({
    daoAddress,
    network,
    pluginAddress,
    tokenAddress,
    memberAddress,
  }: {
    daoAddress?: HexAddress
    pluginAddress?: HexAddress
    tokenAddress?: HexAddress
    memberAddress?: HexAddress
    network?: NetworksEnum
  }) {
    const result: IAggDaoMemberMappingParams[] = []

    // Case 1: If pluginAddress is passed, retrieve members from PluginMember
    if (pluginAddress && network) {
      const params: any = {
        pluginAddress,
        network,
      }

      if (daoAddress) {
        params.daoAddress = daoAddress
      }

      if (memberAddress) {
        params.memberAddress = memberAddress
      }

      const pluginMembers = await Models.PluginMember.find(params)
      // Map PluginMember to IAggDaoMemberMappingParams format
      const mappedPluginMembers = pluginMembers.map(member => ({
        memberAddress: member.memberAddress,
        daoAddress: member.daoAddress,
        pluginAddress: member.pluginAddress,
        network: member.network,
        votingPower: undefined,
        tokenAddress: undefined,
      }))
      result.push(...mappedPluginMembers)

      // Check if plugin has tokenAddress, if yes retrieve from TokenMember
      const plugin = await Models.Plugin.findOne({ address: pluginAddress, network })
      if (plugin?.tokenAddress) {
        const vpParams: any = {
          tokenAddress: plugin.tokenAddress,
          network,
          votingPower: { $ne: '0' },
        }

        if (memberAddress) {
          vpParams.memberAddress = memberAddress
        }

        const tokenMembers = await Models.TokenMember.find(vpParams)
        // Map TokenMember to include plugin context
        const mappedTokenMembers = tokenMembers.map(member => ({
          memberAddress: member.memberAddress,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: member.network,
          votingPower: member.votingPower,
          tokenAddress: member.tokenAddress,
        }))
        result.push(...mappedTokenMembers)
      }
    }
    // Case 2: If tokenAddress is passed directly, query TokenMember directly
    else if (tokenAddress && network) {
      const vpParams: any = {
        tokenAddress,
        network,
        votingPower: { $ne: '0' },
      }

      if (memberAddress) {
        vpParams.memberAddress = memberAddress
      }

      const tokenMembers = await Models.TokenMember.find(vpParams)

      // Find associated plugin to get daoAddress
      const plugin = await Models.Plugin.findOne({ tokenAddress, network })

      // Map TokenMember to include dao context
      const mappedTokenMembers = tokenMembers.map(member => ({
        memberAddress: member.memberAddress,
        daoAddress: plugin?.daoAddress || daoAddress,
        pluginAddress: plugin?.address,
        network: member.network,
        votingPower: member.votingPower,
        tokenAddress: member.tokenAddress,
      }))
      result.push(...mappedTokenMembers)
    }

    // Remove duplicates based on memberAddress
    const uniqueMembers = Array.from(new Map(result.map(item => [item.memberAddress, item])).values())

    return uniqueMembers
  },
}
export default PairDataModule
