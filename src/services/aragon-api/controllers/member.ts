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
  IPluginInterfaceType,
  ITokenType,
  type NetworksEnum,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { MemberGovernanceFactory } from '@modules/memberGovernance'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
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

    switch (plugin.interfaceType) {
      case IPluginInterfaceType.tokenVoting: {
        const token = await Models.Token.findByTokenAddressAndNetwork(plugin.tokenAddress, plugin.network)
        assertExposable(token, ErrorKeyEnum.notFound)

        let address = plugin.tokenAddress
        if (token.type === ITokenType.escrowAdapter) {
          address = plugin.votingEscrow.escrowAddress
          extraParams.escrowAddress = plugin.votingEscrow.escrowAddress
        } else {
          extraParams.tokenAddress = plugin.tokenAddress
        }

        const governance = MemberGovernanceFactory.create({
          address, // escrowAddress or token address
          network: plugin.network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: token.type,
        })

        return governance.findAndPaginateMembers({
          paginationParams,
          extraParams,
        })
      }
      case IPluginInterfaceType.lockToVote: {
        assertExposable(plugin.lockManagerAddress, ErrorKeyEnum.notFound)
        const governance = MemberGovernanceFactory.create({
          address: plugin.lockManagerAddress, // lockManagerAddress
          network: plugin.network,
          interfaceType: IPluginInterfaceType.lockToVote,
        })
        extraParams.lockManagerAddress = plugin.lockManagerAddress
        return governance.findAndPaginateMembers({
          paginationParams,
          extraParams,
        })
      }
      default: {
        // admin and multisig are the same
        const governance = MemberGovernanceFactory.create({
          address: plugin.address, // token address
          network: plugin.network,
          interfaceType: IPluginInterfaceType.multisig,
        })
        return governance.findAndPaginateMembers({
          paginationParams,
          extraParams,
        })
      }
    }
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
    const member = await Models.PluginMember.findOne({ memberAddress, pluginAddress, ...(network && { network }) })

    return !!member
  },

  getMemberLocks: async (
    extraParams: ILockExtraParams = {},
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMemberLockResponse>> => {
    return await Models.Lock.findWithPagination({ extraParams, paginationParams })
  },
}

export default MemberController
