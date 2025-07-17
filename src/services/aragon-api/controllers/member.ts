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
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    // TODO: need to change
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    assertExposable(!!extraParams.network, ErrorKeyEnum.badParams)

    if (!extraParams.pluginAddress && !extraParams.daoAddress) {
      return await Models.Member.findPaginatedMembersOnly({ paginationParams })
    }

    if (extraParams.daoAddress && !extraParams.pluginAddress) {
      return await Models.DaoMemberMapping.findAndPaginate({
        extraParams,
        paginationParams,
      })
    }

    const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
    assertExposable(plugin, ErrorKeyEnum.notFound)

    if (plugin.tokenAddress) {
      extraParams.tokenAddress = plugin.tokenAddress
      return await Models.MemberBalance.findAndPaginate({
        paginationParams,
        extraParams,
      })
    }

    return await Models.DaoMemberMapping.findAndPaginate({
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
    network: NetworksEnum,
  ): Promise<boolean> => {
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    const memberShipParams = {
      memberAddress,
      pluginAddress,
      tokenAddress: plugin?.tokenAddress!,
      network,
    }

    const isMember = await ProxyMember.isMemberOfDao(memberShipParams)

    return !!isMember
  },

  getMemberLocks: async (
    extraParams: ILockExtraParams = {},
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMemberLockResponse>> => {
    return await Models.Lock.findWithPagination({ extraParams, paginationParams })
  },
}

export default MemberController
