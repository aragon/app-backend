import config from '@config'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ModelUtils from '@models/utils/models'
import PairDataModule from '@modules/pairData'
import { MemberGovernanceFactory } from '@src/governance'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IDelegatorResponse,
  type IExposableError,
  type ILockExtraParams,
  type IMemberExtraParams,
  type IMemberLockResponse,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type NetworksEnum,
} from '@types'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams,
    extraParams: IMemberExtraParams,
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    // required network, daoAddress and pluginAddress
    assertExposable(
      !!(extraParams.network && extraParams.daoAddress && extraParams.pluginAddress),
      ErrorKeyEnum.pluginNotFound,
    )

    const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
    assertExposable(plugin, ErrorKeyEnum.notFound)

    try {
      const governance = MemberGovernanceFactory.createFromPlugin(plugin)
      const result = await governance.findAndPaginateMembers({
        paginationParams,
        extraParams,
      })

      if (result.data.length) {
        const memberAddresses = result.data.map(m => m.address).filter(Boolean)
        const delegationCounts = await governance.countDelegatorsForMembers(memberAddresses)

        for (const member of result.data) {
          if (member.address && member.metrics) {
            member.metrics.delegationCount = delegationCounts[member.address] || 0
          }
        }
      }

      return result
    } catch (_error) {
      return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
    }
  },

  getMemberByAddress: async (
    address: HexAddress,
    extraParams: IMemberExtraParams,
    pairParams: IPairParams,
  ): Promise<IMembersResponse> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const member = await Models.Member.findMemberByAddress(address, extraParams)

    assertExposable(member, ErrorKeyEnum.notFound)
    if (extraParams.network) {
      member.lastActive = await Models.PluginMetrics.findGlobalLastActivity(address, extraParams.network)
    }
    if (extraParams.pluginAddress && extraParams.tokenAddress && extraParams.network) {
      try {
        const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
        if (plugin && member.metrics) {
          const governance = MemberGovernanceFactory.createFromPlugin(plugin)
          const delegationCounts = await governance.countDelegatorsForMembers([address])
          member.metrics.delegationCount = delegationCounts[address] || 0
        }

        const balanceInfo = (await RabbitMQHelper.sendMessage(
          EnumQueueName.memberBalance,
          {
            id: `memberBalance-${address}-${extraParams.tokenAddress || extraParams.pluginAddress}-${extraParams.network}`,
            params: {
              userAddress: address,
              tokenAddress: extraParams.tokenAddress,
              network: extraParams.network,
              pluginAddress: extraParams.pluginAddress,
            },
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        )) as unknown as { balance: string; votingPower: string; currentDelegate: null }
        member.tokenBalance = balanceInfo.balance
        member.votingPower = balanceInfo.votingPower
        member.currentDelegate = balanceInfo.currentDelegate
      } catch (_error) {
        return member
      }
    }

    return member
  },

  isMemberOfPlugin: async (
    memberAddress: HexAddress,
    pluginAddress: HexAddress,
    network?: NetworksEnum,
  ): Promise<boolean> => {
    const member = await Models.PluginMember.findOne({ memberAddress, pluginAddress, ...(network && { network }) })

    return !!member
  },

  getMemberLocks: async (
    extraParams: ILockExtraParams = {},
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMemberLockResponse>> => {
    return await Models.Lock.findWithPagination({ extraParams, paginationParams })
  },

  getDelegatorsForMember: async (
    address: HexAddress,
    paginationParams: IPaginationParams,
    extraParams: IMemberExtraParams,
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IDelegatorResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    assertExposable(!!(extraParams.network && extraParams.pluginAddress), ErrorKeyEnum.pluginNotFound)

    const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
    assertExposable(plugin, ErrorKeyEnum.notFound)

    try {
      const governance = MemberGovernanceFactory.createFromPlugin(plugin)
      return await governance.findDelegatorsForMember(address, paginationParams, extraParams)
    } catch (error) {
      if ((error as IExposableError).exposeCustom_) throw error
      return ModelUtils.paginateEmptyResponse(paginationParams.pageSize || 10)
    }
  },
}

export default MemberController
