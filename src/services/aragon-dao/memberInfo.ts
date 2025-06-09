import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { type HexAddress, IPluginInterfaceType, type NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import type Plugin from '@models/schema/plugin'
import type PluginSetting from '@models/schema/setting'

export const MemberInfo = {
  getVotingPower: async (userAddress: string, tokenAddress: string, network: NetworksEnum): Promise<string> => {
    try {
      const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
      if (!token) {
        return '0'
      }

      return (await GovernanceErc20Helper.getVotes(userAddress, tokenAddress, network)).toString()
    } catch (e) {
      return '0'
    }
  },

  getByTokenAddress: async (
    userAddress: string,
    pluginAddress: string | null,
    tokenAddress: string | null,
    network: NetworksEnum,
  ): Promise<{
    balance: string | null
    votingPower: string | null
    currentDelegate: string | null
  }> => {
    const response = {
      balance: null,
      votingPower: null,
      currentDelegate: null,
    }

    try {
      if (!tokenAddress && !pluginAddress) {
        return response
      }

      if (pluginAddress) {
        const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
        if (!plugin || plugin.interfaceType !== IPluginInterfaceType.tokenVoting) {
          return response
        }
        tokenAddress = plugin.tokenAddress
      }

      const token = await ProxyToken.saveAndGetToken(tokenAddress!, network)
      if (!token) {
        return response
      }

      const balance = (await Web3Helper.getERC20Balance(userAddress, tokenAddress!, network)).toString()
      const votingPower = (await GovernanceErc20Helper.getVotes(userAddress, tokenAddress!, network)).toString()

      Object.assign(response, { balance, votingPower })

      if (token.hasDelegate) {
        response.currentDelegate = await GovernanceErc20Helper.getDelegates(userAddress, tokenAddress!, network)
      }

      return response
    } catch (e) {
      return response
    }
  },

  canCreateProposal: async (pluginAddress: HexAddress, memberAddress: HexAddress, network: NetworksEnum) => {
    try {
      const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
      if (!plugin) {
        return false
      }

      const settings = await Models.Setting.findActive({
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: plugin.network,
      })

      switch (plugin.interfaceType) {
        case IPluginInterfaceType.tokenVoting:
          return await MemberInfo._checkForTokenVoting(plugin, settings, memberAddress)
        case IPluginInterfaceType.multisig:
          return await MemberInfo._checkForMultiSig(plugin, settings, memberAddress)
        case IPluginInterfaceType.admin:
          return await MemberInfo._checkForAdmin(plugin, settings, memberAddress)
        default:
          return false
      }
    } catch (e) {
      return false
    }
  },

  _checkForTokenVoting: async (plugin: Plugin, setting: PluginSetting, memberAddress: HexAddress) => {
    if (!setting || !plugin.tokenAddress) return false
    const votingPower = await GovernanceErc20Helper.getVotes(memberAddress, plugin.tokenAddress, plugin.network)
    return Number(votingPower) > 0 && Number(votingPower) >= Number(setting.minParticipation)
  },

  _checkForMultiSig: async (plugin: Plugin, setting: PluginSetting, memberAddress: HexAddress) => {
    if (!setting) return false

    return setting?.onlyListed ? await Web3Helper.isMember(plugin.address, memberAddress, plugin.network) : true
  },
  _checkForAdmin: async (plugin: Plugin, _setting: PluginSetting, memberAddress: HexAddress) => {
    const daoMemberMapping = await Models.DaoMemberMapping.findOne({
      daoAddress: plugin.daoAddress,
      memberAddress,
      network: plugin.network,
    })

    return !!daoMemberMapping
  },

  getLockVotingPowerBatch: async (
    locks: Array<{
      lockId: string
      tokenId: string
      escrowAddress: HexAddress
      timestamp: number
      network: NetworksEnum
    }>,
  ): Promise<Array<{ tokenId: string; votingPower: string }>> => {
    try {
      if (locks.length === 0) return []

      const batchParams = locks.map(lock => ({
        escrowAddress: lock.escrowAddress,
        tokenId: lock.tokenId,
        ts: lock.timestamp,
      }))

      const network = locks[0].network
      const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, network)

      if (!results || !Array.isArray(results)) {
        return locks.map(lock => ({
          tokenId: lock.tokenId,
          votingPower: '0',
        }))
      }

      return results.map(result => ({
        tokenId: result.tokenId,
        votingPower: result.votingPower.toString(),
      }))
    } catch (e) {
      return locks.map(lock => ({
        tokenId: lock.tokenId,
        votingPower: '0',
      }))
    }
  },
}
