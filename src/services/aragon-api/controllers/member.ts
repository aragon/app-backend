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
import type DaoMemberMapping from '@models/schema/daoMemberMapping'
import ModelUtils from '@models/utils/models'
import { RabbitMQHelper } from '@helpers/radditMQ'
import config from '@config'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    const mapping = await PairDataModule.pairFromDaoMemberMapping({
      daoAddress: extraParams.daoAddress,
      pluginAddress: extraParams.pluginAddress,
      network: extraParams.network,
    })

    const memberAddresses = mapping.map((w: DaoMemberMapping) => w.memberAddress)

    if (Object.values(extraParams).filter(v => v).length > 0 && memberAddresses.length === 0) {
      return ModelUtils.paginateEmptyResponse(paginationParams.limit!)
    }

    return await Models.Member.findWithPagination({
      extraParams,
      paginationParams,
      extraQueryData: { memberAddresses },
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
    if (extraParams.tokenAddress && extraParams.network) {
      try {
        const balanceInfo = (await RabbitMQHelper.sendMessage(
          EnumQueueName.memberBalance,
          {
            id: `memberBalance-${address}-${extraParams.tokenAddress}-${extraParams.network}`,
            params: {
              userAddress: address,
              tokenAddress: extraParams.tokenAddress,
              network: extraParams.network,
            },
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        )) as unknown as { balance: string; votingPower: string; currentDelegate: null }
        member.balance = balanceInfo.balance
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
