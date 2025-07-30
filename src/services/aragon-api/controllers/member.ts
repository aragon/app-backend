import { Models } from '@dbModels'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type ILockExtraParams,
  type IMemberExtraParams,
  type IMemberLockResponse,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type NetworksEnum,
  IPluginInterfaceType,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import type Plugin from '@models/schema/plugin'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    assertExposable(!!extraParams.network, ErrorKeyEnum.badParams)

    if (!extraParams.pluginAddress && !extraParams.daoAddress) {
      return Models.Member.findPaginatedMembersOnly({ paginationParams })
    }

    if (extraParams.daoAddress && !extraParams.pluginAddress) {
      return Models.DaoMemberMapping.findAndPaginate({
        extraParams,
        paginationParams,
      })
    }

    const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
    assertExposable(plugin, ErrorKeyEnum.notFound)

    // Check for LockManager/lockToVote interface type
    if (plugin.interfaceType === IPluginInterfaceType.lockToVote) {
      return await MemberController.getMembersOfLockManagerPlugin(paginationParams, plugin)
    }

    if (plugin.tokenAddress) {
      if (plugin.votingEscrow !== null && plugin.votingEscrow.escrowAddress) {
        return await MemberController.getMembersOfVeLockPlugin(paginationParams, plugin)
      }

      extraParams.tokenAddress = plugin.tokenAddress
      return Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })
    }

    return Models.DaoMemberMapping.findAndPaginate({
      extraParams,
      paginationParams,
    })
  },

  getMemberByAddress: async (
    address: HexAddress,
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IMembersResponse> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const member = await Models.Member.findMemberByAddress(address, extraParams)

    assertExposable(member, ErrorKeyEnum.notFound)
    if ((extraParams.tokenAddress || extraParams.pluginAddress) && extraParams.network) {
      try {
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
      } catch (error) {
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
    const member = await Models.DaoMemberMapping.findOne({ memberAddress, pluginAddress, ...(network && { network }) })

    return !!member
  },

  getMemberLocks: async (
    extraParams: ILockExtraParams = {},
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMemberLockResponse>> => {
    return await Models.Lock.findWithPagination({ extraParams, paginationParams })
  },

  getMembersOfVeLockPlugin: async (paginationParams: IPaginationParams = {}, plugin: Plugin) => {
    const settings = await Models.Setting.findActive({
      daoAddress: plugin.daoAddress,
      network: plugin.network,
      pluginAddress: plugin.address,
      tokenAddress: plugin.tokenAddress,
    })

    const token = await Models.Token.findOne({
      address: plugin.tokenAddress,
      network: plugin.network,
    })

    assertExposable(token && settings, ErrorKeyEnum.notFound)

    return Models.Lock.getMembersOfVeLockPlugin({
      paginationParams,
      pluginAddress: plugin.address,
      settings: {
        currentTime: Math.floor(Date.now() / 1000),
        maxTime: settings.votingEscrow.maxTime,
        slope: settings.votingEscrow.slope,
        bias: settings.votingEscrow.bias,
        decimals: (BigInt(10) ** BigInt(token.decimals)).toString(),
      },
      tokenAddress: plugin.tokenAddress,
      network: plugin.network,
    })
  },

  getMembersOfLockManagerPlugin: async (paginationParams: IPaginationParams = {}, plugin: Plugin) => {
    return Models.LockManagerMember.findAndPaginate({
      paginationParams,
      pluginAddress: plugin.address,
      network: plugin.network,
    })
  },
}

export default MemberController
