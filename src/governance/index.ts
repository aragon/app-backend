import { type HexAddress, IPluginInterfaceType, ITokenType, type NetworksEnum } from '@types'
import { BaseGovernance } from './baseGovernance'
import { PluginGovernance } from './pluginGovernance'
import { Erc20Governance } from './erc20Governance'
import { VeGovernance } from './veGovernance'
import { LockToVoteGovernance } from './lockToVoteGovernance'
import { MultisigGovernance } from './multisigGovernance'
import { AdminGovernance } from './adminGovernance'
import { CapitalDistributorGovernance } from './capitalDistributorGovernance'
import { GaugeGovernance } from './gaugeGovernance'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import type Plugin from '@models/schema/plugin'
import logger from '@logger'

export { BaseGovernance }
export { PluginGovernance }
export { Erc20Governance }
export { VeGovernance }
export { LockToVoteGovernance }
export { MultisigGovernance }
export { AdminGovernance }
export { CapitalDistributorGovernance }
export { GaugeGovernance }

const llo = logger.logMeta.bind(null, { service: 'MemberGovernanceFactory' })

type GovernanceType =
  | VeGovernance
  | Erc20Governance
  | LockToVoteGovernance
  | MultisigGovernance
  | AdminGovernance
  | CapitalDistributorGovernance
  | GaugeGovernance

/**
 * Factory class for creating governance instances based on plugin interface type.
 *
 * Each governance type requires specific parameters:
 *
 * - **ERC20 Governance**:
 *   - `address`: The token address
 *   - `tokenType`: The token type
 *   - `network`: The blockchain network
 *
 * - **VE Governance**:
 *   - `address`: The escrow address
 *   - `tokenType`: Must be ITokenType.escrowAdapter
 *   - `network`: The blockchain network
 *   - `extraParams.escrowAdapterAddress`: The escrow adapter address
 *
 * - **Multisig Governance**:
 *   - `address`: The plugin address
 *   - `network`: The blockchain network
 *
 * - **Admin Governance**:
 *   - `address`: The plugin address
 *   - `network`: The blockchain network
 *
 * - **Lock to Vote Governance**:
 *   - `address`: The lock manager address
 *   - `network`: The blockchain network
 *
 * - **Capital Distributor Governance**:
 *   - `address`: The plugin address
 *   - `network`: The blockchain network
 */
export class MemberGovernanceFactory {
  // Implementation - returns union of all types
  static createFromPlugin(plugin: Plugin): GovernanceType {
    try {
      // Handle token voting plugins
      if (plugin.interfaceType === IPluginInterfaceType.tokenVoting) {
        // Check if it's VE governance (has votingEscrow configuration)
        if (plugin.votingEscrow?.escrowAddress) {
          return MemberGovernanceFactory.create({
            address: plugin.votingEscrow.escrowAddress,
            network: plugin.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
            extraParams: {
              escrowAdapterAddress: plugin.tokenAddress,
            },
          })
        }
        // Regular ERC20 token governance
        if (plugin.tokenAddress) {
          return MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: plugin.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
          })
        }
      }

      if (plugin.interfaceType === IPluginInterfaceType.gauge) {
        return MemberGovernanceFactory.create({
          address: plugin.address,
          network: plugin.network,
          interfaceType: IPluginInterfaceType.gauge,
        })
      }

      // Handle lock to vote governance
      if (plugin.interfaceType === IPluginInterfaceType.lockToVote) {
        return MemberGovernanceFactory.create({
          address: plugin.lockManagerAddress!,
          network: plugin.network,
          interfaceType: IPluginInterfaceType.lockToVote,
        })
      }

      // Handle multisig governance
      if (plugin.interfaceType === IPluginInterfaceType.multisig) {
        return MemberGovernanceFactory.create({
          address: plugin.address,
          network: plugin.network,
          interfaceType: IPluginInterfaceType.multisig,
        })
      }

      // Handle admin governance
      if (plugin.interfaceType === IPluginInterfaceType.admin) {
        return MemberGovernanceFactory.create({
          address: plugin.address,
          network: plugin.network,
          interfaceType: IPluginInterfaceType.admin,
        })
      }

      if (plugin.interfaceType === IPluginInterfaceType.capitalDistributor) {
        return MemberGovernanceFactory.create({
          address: plugin.address,
          network: plugin.network,
          interfaceType: IPluginInterfaceType.capitalDistributor,
        })
      }

      // If we reach here, the plugin type is not supported
      throw new Error(`Unsupported plugin interface type: ${plugin.interfaceType}`)
    } catch (error) {
      logger.warn('Unable to create governance from plugin', llo({ plugin, error }))
      throw error
    }
  }

  static create(params: {
    address: HexAddress
    network: NetworksEnum
    interfaceType: IPluginInterfaceType
    tokenType?: ITokenType
    extraParams?: {
      escrowAdapterAddress?: HexAddress
    }
  }): GovernanceType {
    switch (params.interfaceType) {
      case IPluginInterfaceType.tokenVoting:
        switch (params.tokenType) {
          case ITokenType.escrowAdapter:
            // the address is the escrowAddress
            return new VeGovernance(params.address, params.network, params.extraParams)
          default:
            // the address is the tokenAddress
            return new Erc20Governance(params.address, params.network)
        }

      case IPluginInterfaceType.lockToVote:
        // the address is the lockManagerAddress
        return new LockToVoteGovernance(params.address, params.network)

      case IPluginInterfaceType.multisig:
        // the address is the pluginAddress
        return new MultisigGovernance(params.address, params.network)

      case IPluginInterfaceType.admin:
        // the address is the pluginAddress
        return new AdminGovernance(params.address, params.network)

      case IPluginInterfaceType.capitalDistributor:
        // the address is the pluginAddress
        return new CapitalDistributorGovernance(params.address, params.network)

      case IPluginInterfaceType.gauge:
        // the address is the pluginAddress
        return new GaugeGovernance(params.address, params.network)

      case IPluginInterfaceType.spp:
      case IPluginInterfaceType.unknown:
      default:
        logger.warn('Unsupported plugin interface type, returning null', llo(params))
        throw new Error('Unsupported plugin interface type')
    }
  }

  /**
   * Static method to create or ensure a base member exists
   * This wraps the BaseGovernance.ensureBaseMember in a transaction context
   * @param memberAddress The address of the member to create
   * @param lastActivity Optional block number for activity tracking
   * @returns The created or existing Member record
   */
  static async createBaseMember(memberAddress: HexAddress, lastActivity?: number): Promise<Member | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const member = await BaseGovernance.ensureBaseMember(memberAddress, lastActivity, session)
        if (member) {
          await session.commitTransaction()
          await session.endSession()
        }
        return member
      })
    } catch (error) {
      logger.error('Error creating base member', llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }
}
