import { Models } from '@dbModels'
import { type HexAddress, IMetricAction, type NetworksEnum, SupportedEnsNetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import type MemberBalance from '@models/schema/memberBalance'
import type MemberMetrics from '@models/schema/memberMetrics'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyMember' })

export const ProxyMember = {
  createMember: async (memberAddress: HexAddress): Promise<Member | null> => {
    const parsedMemberAddress = Web3Utils.parseAddress(memberAddress) || memberAddress
    if (!parsedMemberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress }, { session })

        if (!existingMember) {
          const rawMember = {
            address: parsedMemberAddress,
            ens: await EnsHelper.getEnsWithUniversalResolver(parsedMemberAddress),
          }

          const newMember = await Models.Member.create(rawMember, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Create document - New Member', llo({ documentId: newMember.id }))
          return newMember
        }

        return existingMember
      })
    } catch (error) {
      logger.error('Error creating new member', llo({ error, memberAddress: parsedMemberAddress }))
      return null
    }
  },

  createMetrics: async ({
    address,
    pluginAddress,
    network,
  }: {
    address: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberMetrics | null> => {
    try {
      const memberAddress = Web3Utils.parseAddress(address)
      if (!memberAddress) {
        return null
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const metrics = await Models.MemberMetrics.findOne({ address: memberAddress, pluginAddress, network }, null, {
          session,
        })

        if (metrics) {
          return metrics
        }

        const rawMetrics = { address: memberAddress, pluginAddress, network }

        const newMetrics = await Models.MemberMetrics.create(rawMetrics, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Create document - New MemberMetrics', llo({ documentId: newMetrics.id }))
        return newMetrics
      })
    } catch (error) {
      logger.error('Error creating new member metrics', llo({ error, address, pluginAddress }))
      return null
    }
  },

  getBalances: async ({
    address,
    tokenAddress,
    network,
  }: {
    address: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberBalance | null> => {
    try {
      const memberAddress = Web3Utils.parseAddress(address)
      if (!memberAddress) {
        return null
      }
      return await DbTx.executeTxFn(async ({ session }) => {
        const token = await Models.MemberBalance.findByAddressAndToken(
          { address: memberAddress, tokenAddress, network },
          { session },
        )

        if (token) {
          return token
        }

        const data = { address: memberAddress, tokenAddress, network }
        const memberBalance = await Models.MemberBalance.create(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Create document - New MemberBalance', llo({ documentId: memberBalance.id }))
        return memberBalance
      })
    } catch (error) {
      logger.error('Error getting member balances', llo({ error, address, tokenAddress }))
      return null
    }
  },

  updateActivity: async ({
    memberAddress,
    pluginAddress,
    blockNumber,
    network,
  }: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    blockNumber: number
    network: NetworksEnum
  }): Promise<Member | null> => {
    try {
      const [member, memberMetrics, blockTimestamp] = await Promise.all([
        ProxyMember.createMember(memberAddress),
        ProxyMember.createMetrics({
          address: memberAddress,
          pluginAddress,
          network,
        }),
        Web3Helper.getBlockTimestamp(blockNumber, network),
      ])

      if (!member || !memberMetrics) return null

      const updateFields: Partial<Member> = {
        lastActivity: blockTimestamp,
      }

      if (!member?.firstActivity) {
        updateFields.firstActivity = blockTimestamp
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const updatedMember = await memberMetrics?.update(updateFields, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Member activity', llo({ documentId: updatedMember.id }))
        return updatedMember
      })
    } catch (error) {
      logger.error('Error updating member activity', llo({ error, memberAddress, pluginAddress, blockNumber, network }))
      return null
    }
  },

  updateDelegationMetrics: async ({
    memberAddress,
    pluginAddress,
    tokenAddress,
    network,
  }: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<MemberMetrics | undefined | null> => {
    const address = Web3Utils.parseAddress(memberAddress)
    if (!address) return null

    const metrics = await ProxyMember.createMetrics({
      address,
      pluginAddress,
      network,
    })

    if (!metrics) {
      logger.error('Failed to create metrics', llo({ memberAddress, pluginAddress, tokenAddress, network }))
      return
    }

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const delegateReceivedCount = await Models.MemberTransaction.getReceiveDelegationCount(
          address,
          tokenAddress,
          network,
          { session },
        )
        const logDb = await metrics.update({ delegateReceivedCount }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated Member DAO metrics', { logId: logDb.id })
        return logDb
      })
    } catch (error) {
      logger.error(
        'Error updating delegation metrics',
        llo({
          error,
          address,
          pluginAddress,
          tokenAddress,
          network,
        }),
      )
    }
  },

  updateMetricsByAction: async (
    metricAction: IMetricAction,
    {
      memberAddress,
      pluginAddress,
      network,
    }: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
    },
  ) => {
    const address = Web3Utils.parseAddress(memberAddress)
    if (!address) return null

    const metrics = await ProxyMember.createMetrics({
      address,
      pluginAddress,
      network,
    })

    if (!metrics) return

    const metricActionsMap = {
      [IMetricAction.increaseProposalCount]: metrics.increaseProposalCount,
      [IMetricAction.increaseVoteCount]: metrics.increaseVoteCount,
      [IMetricAction.increaseDelegateReceivedCount]: metrics.increaseDelegateReceivedCount,
      [IMetricAction.decreaseDelegateReceivedCount]: metrics.decreaseDelegateReceivedCount,
    }

    const metricUpdateFn = metricActionsMap[metricAction]

    if (metricUpdateFn) {
      try {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await metricUpdateFn.call(metrics, 1, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Updated Member DAO metrics', { logId: logDb.id })
        })
      } catch (error) {
        logger.error('Error updating member metrics', llo({ error, address, pluginAddress, network }))
      }
    } else {
      logger.error('Unsupported metric action', llo({ metricAction, address, pluginAddress, network }))
    }
  },

  addToDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress?: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(memberAddress)
    if (!member) {
      logger.error('Failed to add member to dao', llo({ params }))
      return null
    }

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const queryParams = {
          memberAddress,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          tokenAddress: params?.tokenAddress,
          network: params.network,
        }
        const existingDao = await ProxyMember.isMemberOfDao(queryParams, session)
        if (!existingDao) {
          await Models.DaoMemberMapping.create(queryParams, { session })
          await session.commitTransaction()
          await session.endSession()
        }
        return member
      })
    } catch (error) {
      logger.error('Error in addToDao', llo({ error, params }))
      return null
    }
  },

  removeFromDao: async (params: {
    memberAddress: HexAddress
    daoAddress: HexAddress
    pluginAddress: HexAddress
    tokenAddress?: HexAddress
    network: NetworksEnum
  }): Promise<Member | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    const member = await ProxyMember.createMember(memberAddress)

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const queryParams = {
          memberAddress,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          tokenAddress: params?.tokenAddress,
          network: params.network,
        }
        const existingDao = await ProxyMember.isMemberOfDao(queryParams, session)

        if (existingDao) {
          const logDb = await existingDao.removeSelf({ session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Remove DaoMemberMapping', llo({ logId: logDb.id }))
        }

        return member
      })
    } catch (error) {
      logger.error('Error in removeFromDao', llo({ error, params }))
      return null
    }
  },

  isMemberOfDao: async (
    params: {
      memberAddress: HexAddress
      daoAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
      tokenAddress?: HexAddress
    },
    session?: any,
  ) => {
    return Models.DaoMemberMapping.findMapping(params, { session })
  },

  bulkMemberCreation: async (memberAddresses: HexAddress[], network: NetworksEnum) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const parsedAddresses = [...new Set(memberAddresses.map(Web3Utils.parseAddress).filter(Boolean) as HexAddress[])]

      const existingMembers = await Models.Member.find(
        {
          address: { $in: parsedAddresses },
        },
        null,
        { session },
      ).lean()

      const existingMemberSet = new Set(existingMembers.map(m => m.address.toLowerCase()))
      const newAddresses = parsedAddresses.filter(address => !existingMemberSet.has(address.toLowerCase()))

      if (newAddresses.length > 0) {
        const isEnsSupported = Object.values(SupportedEnsNetworksEnum).includes(network as any)
        const chunkSize = 500
        for (let i = 0; i < newAddresses.length; i += chunkSize) {
          const chunk = newAddresses.slice(i, i + chunkSize)
          const newMembersData = await Promise.all(
            chunk.map(async address => ({
              id: address,
              address,
              ens: !isEnsSupported ? null : await EnsHelper.getEnsWithUniversalResolver(address),
              avatar: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              __v: 0,
            })),
          )

          try {
            await Models.Member.insertMany(
              newMembersData,
              {
                ordered: false,
                lean: true,
              },
              { session },
            )
          } catch (error: any) {
            logger.warn('Some members already existed', llo({ error, duplicates: error.writeErrors?.length || 0 }))
          }
        }
        await session.commitTransaction()
        await session.endSession()
      }
    })
  },

  bulkBalanceCreation: async (
    balanceParams: Array<{
      address: HexAddress
      balance: string
    }>,
    network: NetworksEnum,
    tokenAddress: HexAddress,
    blockNumber: number,
  ) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const existingBalances = await Models.MemberBalance.find(
        {
          $or: balanceParams.map(({ address }) => ({
            address,
            tokenAddress,
            network,
          })),
        },
        null,
        { session },
      ).lean()

      const existingBalanceMap = new Map(
        existingBalances.map(b => [`${b.address.toLowerCase()}_${b.tokenAddress.toLowerCase()}_${b.network}`, b]),
      )

      const balancesToUpdate: Array<{ id: any; updateData: any }> = []
      const balancesToCreate: Array<any> = []

      for (const param of balanceParams) {
        const key = `${param.address.toLowerCase()}_${tokenAddress.toLowerCase()}_${network}`
        const existingBalance: any = existingBalanceMap.get(key)

        if (existingBalance) {
          balancesToUpdate.push({
            id: existingBalance.id!,
            updateData: {
              amount: param.balance,
              lastSyncAmountBlockNumber: blockNumber,
              updatedAt: new Date(),
            },
          })
        } else {
          balancesToCreate.push({
            id: Models.MemberBalance.getEntityId({
              network,
              address: param.address,
              tokenAddress,
            }),
            address: param.address,
            tokenAddress,
            network,
            amount: param.balance,
            lastSyncAmountBlockNumber: blockNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0,
          })
        }
      }

      if (balancesToUpdate.length > 0) {
        const bulkOps = balancesToUpdate.map(({ id, updateData }) => ({
          updateOne: {
            filter: { id },
            update: { $set: updateData },
          },
        }))

        await Models.MemberBalance.bulkWrite(
          bulkOps,
          {
            ordered: false,
            lean: true,
          },
          { session },
        )
      }

      if (balancesToCreate.length > 0) {
        try {
          await Models.MemberBalance.insertMany(
            balancesToCreate,
            {
              ordered: false,
              lean: true,
            },
            { session },
          )
        } catch (error: any) {
          logger.warn('Some balances already existed', llo({ duplicates: error.writeErrors?.length || 0 }))
        }
      }

      await session.commitTransaction()
      await session.endSession()
    })
  },

  /**
   * 🔥 FIXED: DAO membership management with return values and better logging
   */
  bulkDaoMembershipManagement: async (
    params: Array<{
      memberAddress: HexAddress
      hasBalance: boolean
    }>,
    daoAddress: HexAddress,
    pluginAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ) => {
    await DbTx.executeTxFn(async ({ session }) => {
      try {
        const memberAddresses = params.map(p => p.memberAddress)

        const existingMemberships = await Models.DaoMemberMapping.find(
          {
            memberAddress: { $in: memberAddresses },
            daoAddress,
            pluginAddress,
            tokenAddress,
            network,
          },
          null,
          { session },
        ).lean()

        const existingMemberSet = new Set(existingMemberships.map(m => m.memberAddress.toLowerCase()))

        const membersToAdd: HexAddress[] = []
        const membersToRemove: HexAddress[] = []

        for (const param of params) {
          const address = param.memberAddress.toLowerCase()
          const isCurrentlyMember = existingMemberSet.has(address)
          const shouldBeMember = param.hasBalance

          if (shouldBeMember && !isCurrentlyMember) {
            membersToAdd.push(param.memberAddress)
          } else if (!shouldBeMember && isCurrentlyMember) {
            membersToRemove.push(param.memberAddress)
          }
        }

        const operations: Promise<any>[] = []

        if (membersToAdd.length > 0) {
          const membershipData = membersToAdd.map(memberAddress => ({
            memberAddress,
            daoAddress,
            pluginAddress,
            tokenAddress,
            network,
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0,
          }))

          operations.push(
            Models.DaoMemberMapping.insertMany(
              membershipData,
              {
                ordered: false,
                lean: true,
              },
              { session },
            ).catch((error: any) => {
              logger.warn(
                'Some DAO memberships already exist',
                llo({
                  duplicateCount: error?.writeErrors?.length || 0,
                }),
              )
            }),
          )
        }

        // Remove members
        if (membersToRemove.length > 0) {
          operations.push(
            Models.DaoMemberMapping.deleteMany(
              {
                memberAddress: { $in: membersToRemove },
                daoAddress,
                pluginAddress,
                tokenAddress,
                network,
              },
              { session },
            ),
          )
        }

        await Promise.all(operations)
        await session.commitTransaction()
        await session.endSession()
      } catch (error) {
        logger.error(
          'Error in DAO membership management',
          llo({
            error,
            memberCount: params.length,
            daoAddress,
            tokenAddress,
          }),
        )
      }
    })
  },

  optimizedDaoMembershipManagement: async (
    params: Array<{
      address: HexAddress
      value: string
    }>,
    daoAddress: HexAddress,
    pluginAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    blockNumber: number,
  ) => {
    try {
      await Promise.all([
        ProxyMember.bulkMemberCreation(
          params.map(p => p.address),
          network,
        ),
        ProxyMember.bulkBalanceCreation(
          params.map(p => ({
            address: p.address,
            balance: p.value,
          })),
          network,
          tokenAddress,
          blockNumber,
        ),
        ProxyMember.bulkDaoMembershipManagement(
          params.map(p => ({
            memberAddress: p.address,
            hasBalance: p.value !== '0',
          })),
          daoAddress,
          pluginAddress,
          tokenAddress,
          network,
        ),
      ])
    } catch (error) {
      logger.error(
        'Error in optimized DAO membership management pipeline',
        llo({
          error,
          paramCount: params.length,
          daoAddress,
          tokenAddress,
          network,
        }),
      )
      throw error
    }
  },
}
