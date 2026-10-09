import config from '@config'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ModelUtils from '@models/utils/models'
import PairDataModule from '@modules/pairData'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { MemberGovernanceFactory } from '@src/governance'
import {
  EnumQueueName,
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
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
  VotingBodyBrandIdentity,
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

    // The Plugin probe covers Execute-process associations. SPP Safe bodies live in stage settings;
    // the indexed existence query identifies them without running relation discovery for ordinary plugins.
    const hasSafeAssociation =
      (await Models.Plugin.exists({
        address: extraParams.pluginAddress!,
        network: extraParams.network!,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.safe,
      })) ||
      (await Models.Setting.exists({
        network: extraParams.network!,
        status: ISettingStatus.active,
        stages: {
          $elemMatch: {
            plugins: {
              $elemMatch: { address: extraParams.pluginAddress!, brandId: VotingBodyBrandIdentity.SAFE },
            },
          },
        },
      }))

    if (hasSafeAssociation) {
      // Resolve the exact DAO/network Safe capability before any generic plugin lookup: a colliding
      // Plugin row at the Safe address must never divert an active Safe association.
      const safeAddresses = await SafeBodyMembersModule.getSafeAddresses(extraParams.daoAddress!, extraParams.network!)
      if (safeAddresses.includes(extraParams.pluginAddress!)) {
        return await Models.SafeMember.findAndPaginate({ extraParams, paginationParams })
      }

      const safeDaos = await SafeBodyMembersModule.findDaosWithSafeBody(
        [extraParams.pluginAddress!],
        extraParams.network!,
      )
      assertExposable(!safeDaos.length, ErrorKeyEnum.notFound)
    }

    const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
    // No Safe capability and no Plugin document => stale or no relation.
    assertExposable(plugin, ErrorKeyEnum.notFound)

    // Derive tokenAddress from the plugin so downstream consumers (governance impls)
    // that expect it on extraParams pick it up.
    extraParams.tokenAddress ??= plugin.tokenAddress

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
    } catch {
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
      const activity = await Models.PluginMetrics.findGlobalActivity(address, extraParams.network)
      member.firstActive = activity.firstActivity
      member.lastActive = activity.lastActivity
    }

    if (extraParams.pluginAddress && extraParams.network) {
      try {
        // DAO-scoped reads must not enrich members from stale or cross-DAO associations.
        const plugin = extraParams.daoAddress
          ? await Models.Plugin.findOne({
              address: extraParams.pluginAddress,
              daoAddress: extraParams.daoAddress,
              network: extraParams.network,
              status: IPluginStatus.installed,
            }).sort({ isSupported: -1, blockNumber: -1 })
          : await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)

        // Safe ownership is wallet-level. It has no governance token or delegation enrichment,
        // and a same-address plugin from another DAO must not supply either.
        if (!plugin || plugin.interfaceType === IPluginInterfaceType.safe) {
          member.tokenBalance = null
          member.votingPower = null
          member.currentDelegate = null
          if (plugin?.interfaceType === IPluginInterfaceType.safe) member.metrics = null
          return member
        }

        // Derive tokenAddress from the exact DAO association if the caller did not pass it.
        extraParams.tokenAddress ??= plugin.tokenAddress
        if (member.metrics) {
          const governance = MemberGovernanceFactory.createFromPlugin(plugin)
          const delegationCounts = await governance.countDelegatorsForMembers([address])
          member.metrics.delegationCount = delegationCounts[address] || 0
        }

        const balanceInfo = (await RabbitMQHelper.sendMessage(
          EnumQueueName.memberBalance,
          {
            id: `memberBalance-${address}-${extraParams.tokenAddress || extraParams.pluginAddress}-${
              extraParams.network
            }${extraParams.daoAddress ? `-${extraParams.daoAddress}` : ''}`,
            params: {
              userAddress: address,
              tokenAddress: extraParams.tokenAddress,
              network: extraParams.network,
              pluginAddress: extraParams.pluginAddress,
              daoAddress: extraParams.daoAddress,
            },
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        )) as unknown as { balance: string; votingPower: string; currentDelegate: null }
        member.tokenBalance = balanceInfo.balance
        member.votingPower = balanceInfo.votingPower
        member.currentDelegate = balanceInfo.currentDelegate
      } catch {
        return member
      }
    }

    return member
  },

  isMemberOfPlugin: async (
    memberAddress: HexAddress,
    pluginAddress: HexAddress,
    network?: NetworksEnum,
    daoAddress?: HexAddress,
  ): Promise<boolean> => {
    if (network) {
      const daos = await SafeBodyMembersModule.findDaosWithSafeBody([pluginAddress], network)
      if (daos.length) {
        const hasDaoRelation = !daoAddress || daos.some(dao => dao.daoAddress === daoAddress && dao.network === network)
        if (!hasDaoRelation) return false
        return !!(await Models.SafeMember.findOne({ memberAddress, safeAddress: pluginAddress, network }))
      }
    }

    // Only accept a legacy/generic PluginMember after ruling out an active Safe capability.
    const member = await Models.PluginMember.findOne({
      memberAddress,
      pluginAddress,
      ...(network && { network }),
      ...(daoAddress && { daoAddress }),
    })
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
    extraParams.tokenAddress ??= plugin.tokenAddress

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
