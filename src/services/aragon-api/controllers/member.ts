import { Models } from '@dbModels'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import ModelUtils from '@models/utils/models'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    if (!extraParams.pluginAddress && !extraParams.daoAddress) {
      return Models.Member.findPaginatedMembersOnly({ paginationParams })
    }

    if (extraParams.daoAddress && !extraParams.pluginAddress) {
      return Models.DaoMemberMapping.findAndPaginate({
        extraParams,
        paginationParams,
      })
    }

    if (extraParams.pluginAddress) {
      const plugin = await Models.Plugin.findByAddress(extraParams.pluginAddress, extraParams.network)
      assertExposable(plugin, ErrorKeyEnum.notFound)
      if (plugin.tokenAddress) {
        extraParams.tokenAddress = plugin.tokenAddress

        return Models.MemberBalance.findAndPaginate({
          paginationParams,
          extraParams,
        })
      } else {
        return Models.DaoMemberMapping.findAndPaginate({
          extraParams,
          paginationParams,
        })
      }
    }

    const request = ModelUtils.paginateAndSort(paginationParams)
    return ModelUtils.paginateEmptyResponse(request.limit)
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

  isMemberOfPlugin: async (memberAddress: HexAddress, pluginAddress: HexAddress): Promise<boolean> => {
    const member = await Models.DaoMemberMapping.findOne({
      memberAddress,
      pluginAddress,
    })

    return !!member
  },
}

export default MemberController
