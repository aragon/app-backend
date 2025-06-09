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
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'

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

    if (plugin.tokenAddress) {
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

  isMemberOfPlugin: async (memberAddress: HexAddress, pluginAddress: HexAddress): Promise<boolean> => {
    const member = await Models.DaoMemberMapping.findOne({
      memberAddress,
      pluginAddress,
    })

    return !!member
  },

  getMemberLocks: async (
    extraParams: ILockExtraParams = {},
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMemberLockResponse>> => {
    const response = await Models.Lock.findWithPagination({ extraParams, paginationParams })

    if (response.data.length > 0) {
      const locksWithEscrow: any = []
      const tokenIdToLockIndex = {}

      for (let i = 0; i < response.data.length; i++) {
        const lock = response.data[i]
        const plugin = await Models.Plugin.findByAddress(lock.pluginAddress, lock.network)

        if (plugin?.votingEscrow?.escrowAddress) {
          locksWithEscrow.push({
            lockId: lock.id,
            tokenId: lock.tokenId,
            network: lock.network,
            escrowAddress: plugin.votingEscrow.escrowAddress,
            timestamp: lock.blockTimestamp || Math.floor(Date.now() / 1000),
          })

          tokenIdToLockIndex[lock.tokenId] = i
        }
      }

      if (locksWithEscrow.length > 0) {
        const batchResults = await RabbitMQHelper.sendMessage(
          EnumQueueName.getLockVotingPowerBatch,
          {
            id: `lockVotingPowerBatch-${Date.now()}`,
            params: locksWithEscrow,
          },
          { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
        )

        batchResults.forEach(result => {
          const index = tokenIdToLockIndex[result.tokenId]
          if (index !== undefined) {
            response.data[index].votingPower = result.votingPower
          }
        })
      }

      // Ensure all locks have a votingPower property, defaulting to '0'
      response.data = response.data.map(lock => ({
        ...lock,
        votingPower: lock.votingPower || '0',
      }))
    }

    return response
  },
}

export default MemberController
