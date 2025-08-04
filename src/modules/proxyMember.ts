import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import type VpMember from '@models/schema/vpMember'
import type PluginMember from '@models/schema/pluginMember'
import type PluginMetrics from '@models/schema/pluginMetrics'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyMember' })

export const ProxyMember = {
  createMember: async (memberAddress: HexAddress, lastActivity?: number): Promise<Member | null> => {
    const parsedMemberAddress = Web3Utils.parseAddress(memberAddress) || memberAddress
    if (!parsedMemberAddress) return null

    try {
      const member = await DbTx.executeTxFn(async ({ session }) => {
        const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress }, { session })

        if (!existingMember) {
          const rawMember = {
            address: parsedMemberAddress,
            ens: await EnsHelper.getEnsWithUniversalResolver(parsedMemberAddress),
            firstActivity: lastActivity,
            lastActivity,
          }

          const newMember = await Models.Member.create(rawMember, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Create document - New Member', llo({ documentId: newMember.id }))
          return newMember
        } else if (lastActivity) {
          // update lastActivity and firstActivity if not set

          const params: Partial<Member> = {
            lastActivity,
          }

          if (!existingMember?.firstActivity) {
            params.firstActivity = lastActivity
          }
          return await existingMember.update(params, { session })
        }

        return existingMember
      })
      return member
    } catch (error) {
      logger.error('Error creating new member', llo({ error, memberAddress: parsedMemberAddress }))
      return null
    }
  },

  getOrCreateVotingPower: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<VpMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingVpMember = await Models.VpMember.findExistingLog(
          {
            network: params.network,
            tokenAddress: params.tokenAddress,
            memberAddress,
          },
          { session },
        )

        if (existingVpMember) {
          return existingVpMember
        }

        // Create new vpMember document with default voting power
        const newVpMember = await Models.VpMember.create(
          {
            memberAddress,
            tokenAddress: params.tokenAddress,
            votingPower: '0',
            tokenIds: [],
            network: params.network,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new VpMember',
          llo({
            memberAddress,
            tokenAddress: params.tokenAddress,
          }),
        )
        return newVpMember
      })
    } catch (error) {
      logger.error('Error getting or creating voting power', llo({ error, params }))
      return null
    }
  },

  getOrCreatePluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress: HexAddress
    network: NetworksEnum
  }): Promise<PluginMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingPluginMember = await Models.PluginMember.findExistingLog(
          {
            network: params.network,
            pluginAddress: params.pluginAddress,
            memberAddress,
          },
          { session },
        )

        if (existingPluginMember) {
          return existingPluginMember
        }

        // Create new pluginMember document
        const newPluginMember = await Models.PluginMember.create(
          {
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
            network: params.network,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new PluginMember',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
          }),
        )
        return newPluginMember
      })
    } catch (error) {
      logger.error('Error getting or creating plugin member', llo({ error, params }))
      return null
    }
  },

  updateVotingPower: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    votingPower?: string
    tokenIds?: string[]
    network: NetworksEnum
    lastVPBlockNumber?: number
  }): Promise<VpMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the vpMember document
        const vpMember = await ProxyMember.getOrCreateVotingPower({
          memberAddress,
          tokenAddress: params.tokenAddress,
          network: params.network,
        })

        if (!vpMember) {
          logger.error('Failed to get or create VpMember', llo({ params }))
          return null
        }

        // Prepare update data
        const updateData: any = {}

        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
          // If voting power is 0, always set tokenIds to empty array
          if (params.votingPower === '0') {
            updateData.tokenIds = []
          }
        }

        if (params.tokenIds !== undefined) {
          updateData.tokenIds = params.tokenIds
        }

        if (params.lastVPBlockNumber !== undefined) {
          updateData.lastVPBlockNumber = params.lastVPBlockNumber
        }

        // Update if voting power is different or tokenIds need to be updated
        if (
          vpMember.votingPower !== params.votingPower ||
          updateData.tokenIds !== undefined ||
          updateData.lastVPBlockNumber !== undefined
        ) {
          const updated = await vpMember.update(updateData, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose(
            'Updated VpMember voting power',
            llo({
              memberAddress,
              tokenAddress: params.tokenAddress,
              oldVotingPower: vpMember.votingPower,
              newVotingPower: params.votingPower,
            }),
          )
          return updated
        }

        return vpMember
      })
    } catch (error) {
      logger.error('Error updating voting power', llo({ error, params }))
      return null
    }
  },

  updateDelegationMetrics: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<VpMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the vpMember document
        const vpMember = await ProxyMember.getOrCreateVotingPower({
          memberAddress,
          tokenAddress: params.tokenAddress,
          network: params.network,
        })

        if (!vpMember) {
          logger.error('Failed to get or create VpMember', llo({ params }))
          return null
        }

        // Get the delegate received count
        const delegateReceivedCount = await Models.MemberTransaction.getReceiveDelegationCount(
          memberAddress,
          params.tokenAddress,
          params.network,
          { session },
        )

        // Update the vpMember with the delegate count
        const updated = await vpMember.update({ delegateReceivedCount }, { session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated VpMember delegation metrics',
          llo({
            memberAddress,
            tokenAddress: params.tokenAddress,
            delegateReceivedCount,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating delegation metrics', llo({ error, params }))
      return null
    }
  },

  addPluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress: HexAddress
    network: NetworksEnum
  }): Promise<PluginMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    return await ProxyMember.getOrCreatePluginMember({
      memberAddress,
      pluginAddress: params.pluginAddress,
      daoAddress: params.daoAddress,
      network: params.network,
    })
  },

  removePluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<boolean> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const pluginMember = await Models.PluginMember.findByPluginAndMember(
          params.network,
          params.pluginAddress,
          memberAddress,
          { session },
        )

        if (!pluginMember) {
          logger.verbose(
            'Plugin member not found for removal',
            llo({
              memberAddress,
              pluginAddress: params.pluginAddress,
              network: params.network,
            }),
          )
          return false
        }

        await pluginMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Removed plugin member',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            network: params.network,
          }),
        )
        return true
      })
    } catch (error) {
      logger.error('Error removing plugin member', llo({ error, params }))
      return false
    }
  },

  isPluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<boolean> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return false

    try {
      const pluginMember = await Models.PluginMember.findByPluginAndMember(
        params.network,
        params.pluginAddress,
        memberAddress,
      )
      return !!pluginMember
    } catch (error) {
      logger.error('Error checking plugin membership', llo({ error, params }))
      return false
    }
  },

  hasVotingPower: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<boolean> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return false

    try {
      const vpMember = await Models.VpMember.findByTokenAndMember(params.network, params.tokenAddress, memberAddress)
      return !!vpMember && BigInt(vpMember.votingPower) > 0n
    } catch (error) {
      logger.error('Error checking voting power', llo({ error, params }))
      return false
    }
  },

  getOrCreatePluginMetrics: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingPluginMetrics = await Models.PluginMetrics.findExistingLog(
          {
            network: params.network,
            pluginAddress: params.pluginAddress,
            memberAddress,
          },
          { session },
        )

        if (existingPluginMetrics) {
          return existingPluginMetrics
        }

        // Create new pluginMetrics document with default counts
        const newPluginMetrics = await Models.PluginMetrics.create(
          {
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
            network: params.network,
            voteCount: 0,
            proposalCount: 0,
            fistActivity: params.lastActivity,
            lastActivity: params.lastActivity,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new PluginMetrics',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
          }),
        )
        return newPluginMetrics
      })
    } catch (error) {
      logger.error('Error getting or creating plugin metrics', llo({ error, params }))
      return null
    }
  },

  updatePluginMetrics: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the pluginMetrics document
        const pluginMetrics = await ProxyMember.getOrCreatePluginMetrics({
          memberAddress,
          pluginAddress: params.pluginAddress,
          daoAddress: params.daoAddress,
          network: params.network,
          lastActivity: params.lastActivity,
        })

        if (!pluginMetrics) {
          logger.error('Failed to get or create PluginMetrics', llo({ params }))
          return null
        }

        // Count proposals created by this member for this plugin
        const proposalCount = await Models.Proposal.countDocuments(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            creatorAddress: memberAddress,
          },
          { session },
        )

        // Count votes by this member for this plugin
        const voteCount = await Models.Vote.countDocuments(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            memberAddress,
          },
          { session },
        )

        const document: Partial<PluginMetrics> = { proposalCount, voteCount }
        if (params.lastActivity !== undefined) {
          document.lastActivity = params.lastActivity
        }

        // Update the pluginMetrics with the counts
        const updated = await pluginMetrics.update(document, { session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated PluginMetrics',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            proposalCount,
            voteCount,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating plugin metrics', llo({ error, params }))
      return null
    }
  },
}
