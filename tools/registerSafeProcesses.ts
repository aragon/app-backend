import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import { IPermission } from '@src/types/permission'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  type IService,
  type NetworksEnum,
} from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Tools: RegisterSafeProcesses' })

interface IHeldGrant {
  network: NetworksEnum
  whereAddress: HexAddress
  whoAddress: HexAddress
  blockNumber: number
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  /** The grant's condition, null when it was granted without one. */
  conditionAddress: HexAddress | null
}

/**
 * Every EXECUTE_PERMISSION grant on a DAO still in force: the newest event per (network, where,
 * grantee) is a `Granted`. Same shape as `findActiveAcknowledgementPermission`, grouped instead of
 * asked one at a time, because this walks the whole collection.
 *
 * `where` is the tuple's target and the address the crawl hands the handler as the DAO, so it is
 * the key, not `daoAddress`. A DAO also grants execute on its plugins, and keying on the emitting
 * DAO would fold those into the grant on the DAO itself - a revoke on a plugin would then hide a
 * grant that still stands, and a grant on a plugin would register a process of the DAO. Only
 * grants where the target is the emitting DAO are the ones that make a Safe a process.
 */
export const findHeldExecuteGrants = async (network?: NetworksEnum): Promise<IHeldGrant[]> =>
  Models.DaoPermission.aggregate([
    {
      $match: {
        permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        $expr: { $eq: ['$whereAddress', '$daoAddress'] },
        ...(network ? { network } : {}),
      },
    },
    { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
    {
      $group: {
        _id: { network: '$network', whereAddress: '$whereAddress', whoAddress: '$whoAddress' },
        event: { $first: '$event' },
        blockNumber: { $first: '$blockNumber' },
        transactionHash: { $first: '$transactionHash' },
        transactionIndex: { $first: '$transactionIndex' },
        logIndex: { $first: '$logIndex' },
        conditionAddress: { $first: { $ifNull: ['$conditionAddress', null] } },
      },
    },
    { $match: { event: IEventLogPermission.Granted } },
    { $replaceWith: { $mergeObjects: ['$_id', '$$ROOT'] } },
    { $project: { _id: 0, event: 0 } },
  ])

/**
 * Registers the Safes that already held EXECUTE_PERMISSION before Safe processes existed, and
 * finishes any registration a crawl left half done.
 *
 * The handler only runs off a fresh `Granted` event and never again for that grant, so a grant
 * indexed before the feature, or one whose registration failed on a node hiccup, leaves a
 * `DaoPermission` row with no plugin row behind it. This walks those rows and calls the same
 * handler, which is safe to repeat: a grantee that already has a non-Safe plugin row is skipped
 * without a chain read, and a Safe already registered only has its finishing steps re-run. The
 * grant's condition is applied afterwards, null included, since the crawl only sets it on a fresh
 * event. One grant failing never stops the others.
 *
 * `EXECUTE=true` to apply, `TARGET_NETWORK` to limit to one network.
 */
export const RegisterSafeProcesses: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    const execute = process.env.EXECUTE === 'true'
    const targetNetwork = process.env.TARGET_NETWORK as NetworksEnum | undefined

    const grants = await findHeldExecuteGrants(targetNetwork)
    logger.info('RegisterSafeProcesses scan', llo({ heldExecuteGrants: grants.length, execute }))

    if (!execute) {
      logger.info('RegisterSafeProcesses dry run, set EXECUTE=true to apply', llo({ grants: grants.length }))
      return
    }

    let registered = 0
    let failed = 0
    for (const grant of grants) {
      const { network, whereAddress, whoAddress, conditionAddress } = grant
      try {
        const info: ILogInfo = {
          network,
          address: whereAddress,
          blockNumber: grant.blockNumber,
          transactionHash: grant.transactionHash,
          transactionIndex: grant.transactionIndex,
          logIndex: grant.logIndex,
          eventName: IEventLogPermission.Granted,
        }
        const plugin = await PluginHandler.installSafeOnPermissionGranted(whereAddress, whoAddress, info)
        if (!plugin) continue

        await PluginHandler.updateConditionAddress(whoAddress, whereAddress, network, conditionAddress)
        registered += 1
      } catch (error) {
        failed += 1
        logger.error('RegisterSafeProcesses grant failed', llo({ network, whereAddress, whoAddress, error }))
      }
    }

    logger.info('RegisterSafeProcesses End', llo({ scanned: grants.length, registered, failed }))
  },

  stop: async () => {},
}

export default RegisterSafeProcesses
