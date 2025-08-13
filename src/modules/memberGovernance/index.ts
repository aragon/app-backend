import { type HexAddress, IPluginInterfaceType, ITokenType, type NetworksEnum } from '@types'
import { BaseGovernance } from './baseGovernance'
import { PluginGovernance } from './pluginGovernance'
import { TokenGovernance } from './tokenGovernance'
import { Erc20Governance } from './erc20Governance'
import { VeGovernance } from './veGovernance'
import { LockToVoteGovernance } from './lockToVoteGovernance'
import { MultisigGovernance } from './multisigGovernance'
import { AdminGovernance } from './adminGovernance'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import logger from '@logger'

export { BaseGovernance }
export { PluginGovernance }
export { TokenGovernance }
export { Erc20Governance }
export { VeGovernance }
export { LockToVoteGovernance }
export { MultisigGovernance }
export { AdminGovernance }

const llo = logger.logMeta.bind(null, { service: 'MemberGovernanceFactory' })

export class MemberGovernanceFactory {
  static create(params: {
    address: HexAddress
    network: NetworksEnum
    interfaceType: IPluginInterfaceType
    tokenType?: ITokenType
  }): BaseGovernance {
    switch (params.interfaceType) {
      case IPluginInterfaceType.tokenVoting:
        switch (params.tokenType) {
          case ITokenType.escrowAdapter:
            // address is the escrowAddress
            return new VeGovernance(params.address, params.network)
          default:
            // address is the tokenAddress
            return new Erc20Governance(params.address, params.network)
        }

      case IPluginInterfaceType.lockToVote:
        // address is the lockManagerAddress
        return new LockToVoteGovernance(params.address, params.network)

      case IPluginInterfaceType.multisig:
        // address is the pluginAddress
        return new MultisigGovernance(params.address, params.network)

      case IPluginInterfaceType.admin:
        // address is the pluginAddress
        return new AdminGovernance(params.address, params.network)

      case IPluginInterfaceType.spp:
      case IPluginInterfaceType.gauge:
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
