import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { IPermission } from '@src/types/permission'
import {
  type HexAddress,
  IConditionInterfaceType,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginStatus,
  type NetworksEnum,
} from '@types'
import { getAddress, Interface, id, ZeroHash } from 'ethers'

const EMPTY_EXECUTE = new Interface(DAO.abi).encodeFunctionData('execute', [ZeroHash, [], 0])

type DaoRef = { daoAddress: HexAddress; network: NetworksEnum }

/**
 * A Safe as a governance body: its owners are its members, stored once per Safe in `SafeMember`
 * and shared by every DAO that lists the Safe as a body or a process.
 */
export class SafeGovernance extends BaseGovernance {
  /** The DAO permission check sends execute with no actions; selector conditions need action calldata. */
  static async canCreate(memberAddress: HexAddress, plugin: Plugin): Promise<boolean> {
    if (plugin.status !== IPluginStatus.installed) return false

    const owners = await SafeChainReaderModule.readOwners(plugin.network, plugin.address)
    if (!owners?.includes(getAddress(memberAddress))) return false

    if (plugin.conditionInterfaceType === IConditionInterfaceType.executeSelector && plugin.conditionAddress) {
      const hasAllowedSelector = await Models.SelectorPermission.hasEffectiveAllowedSelector({
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        conditionAddress: plugin.conditionAddress,
        network: plugin.network,
      })
      return hasAllowedSelector ?? true
    }

    return await Web3Helper.isGranted(
      plugin.daoAddress,
      plugin.daoAddress,
      plugin.address,
      id(IPermission.EXECUTE_PERMISSION),
      plugin.network,
      EMPTY_EXECUTE,
    )
  }

  /** Add one owner, then refresh every DAO currently referring to the Safe. Null when the event is not ours. */
  async getOrCreate(memberAddress: HexAddress): Promise<any> {
    const known = await this.knownSafe(memberAddress)
    if (!known) return null

    try {
      await BaseGovernance.ensureBaseMember(known.owner)
      await Models.SafeMember.ensure(this.network, this.address, known.owner)
    } catch (error) {
      logger.warn('Unable to add Safe owner membership', this.llo({ safeAddress: this.address, memberAddress, error }))
      return null
    }

    await this.updateDaoMetrics(known.daos)
    return await this.findOne(known.owner)
  }

  async create(memberAddress: HexAddress): Promise<any> {
    return this.getOrCreate(memberAddress)
  }

  async update(): Promise<any> {
    throw new Error('Update not implemented')
  }

  /** Remove one owner, then refresh every DAO currently referring to the Safe. */
  async delete(memberAddress: HexAddress): Promise<boolean> {
    const known = await this.knownSafe(memberAddress)
    if (!known) return false

    let removed = false
    try {
      removed = await Models.SafeMember.removeOwner(this.network, this.address, known.owner)
    } catch (error) {
      logger.warn(
        'Unable to remove Safe owner membership',
        this.llo({ safeAddress: this.address, memberAddress, error }),
      )
      return false
    }

    if (!removed) return false
    logger.verbose('Withdrew Safe body membership', this.llo({ safeAddress: this.address, owner: known.owner }))
    await this.updateDaoMetrics(known.daos)
    return true
  }

  async findOne(memberAddress: HexAddress): Promise<any> {
    return await Models.SafeMember.findOwner(this.network, this.address, memberAddress)
  }

  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    return Models.SafeMember.findAndPaginate({
      paginationParams: params.paginationParams,
      extraParams: { ...params.extraParams, pluginAddress: this.address, network: this.network },
    })
  }

  /** One DAO metrics job per DAO the Safe belongs to. */
  async updateDaoMetrics(daos?: DaoRef[]): Promise<void> {
    const targets = daos ?? (await SafeBodyMembersModule.findDaosWithSafeBody([this.address], this.network))
    for (const { daoAddress } of targets) await BaseGovernance.requestDaoMetrics(daoAddress, this.network)
  }

  /**
   * The checksummed owner and the DAOs this Safe belongs to, or null when the event is not ours.
   * A DAO lookup failure still returns the owner: the write must not be lost to a database blip.
   */
  private async knownSafe(memberAddress: HexAddress): Promise<{ owner: HexAddress; daos: DaoRef[] } | null> {
    let owner: HexAddress
    try {
      this.address = getAddress(this.address) as HexAddress
      owner = getAddress(memberAddress) as HexAddress
    } catch (error) {
      logger.warn(
        'Unable to normalize Safe owner membership',
        this.llo({ safeAddress: this.address, memberAddress, error }),
      )
      return null
    }

    let daos: DaoRef[] = []
    try {
      daos = await SafeBodyMembersModule.findDaosWithSafeBody([this.address], this.network)
    } catch (error) {
      logger.warn('Unable to find DAOs for Safe owner metrics', this.llo({ safeAddress: this.address, error }))
      return { owner, daos }
    }

    if (!daos.length) {
      try {
        if (!(await Models.SafeMember.hasOwners(this.network, this.address))) return null
      } catch (error) {
        logger.warn('Unable to check known Safe ownership', this.llo({ safeAddress: this.address, error }))
        return null
      }
    }

    return { owner, daos }
  }

  async reconcileOwners(): Promise<{ added: number; failed: number }> {
    const owners = await SafeChainReaderModule.readOwners(this.network, this.address)
    const result = { added: 0, failed: 0 }
    if (!owners) return result

    for (const owner of owners as HexAddress[]) {
      try {
        if (await Models.SafeMember.findOwner(this.network, this.address, owner)) continue
        if (!(await BaseGovernance.ensureBaseMember(owner))) {
          throw new Error(`Unable to ensure base member ${owner}`)
        }
        await Models.SafeMember.ensure(this.network, this.address, owner)
        result.added += 1
      } catch (error) {
        result.failed += 1
        logger.warn('Unable to repair Safe owner membership', this.llo({ safeAddress: this.address, owner, error }))
      }
    }

    if (result.added > 0) await this.updateDaoMetrics()
    return result
  }
}
