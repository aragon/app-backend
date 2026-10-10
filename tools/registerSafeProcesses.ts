import { Models } from '@dbModels'
import { SafeGovernance } from '@governance/safeGovernance'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import SafeProcessModule from '@modules/safe/safeProcess'
import { IPermission } from '@src/types/permission'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  type IService,
  NetworksEnum,
} from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Tools: RegisterSafeProcesses' })

interface IHeldGrant {
  network: NetworksEnum
  whereAddress: HexAddress
  whoAddress: HexAddress
  blockNumber: number
  transactionHash: string
  transactionIndex: number
  logIndex: number
  conditionAddress: HexAddress | null
}

/**
 * EXECUTE_PERMISSION grants on the DAO itself that still stand: the newest event per
 * (network, where, who) is a Granted. A DAO also grants execute on other contracts, so `where` has to
 * be the emitting DAO.
 */
const findHeldExecuteGrants = async (network?: NetworksEnum): Promise<IHeldGrant[]> =>
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
 * Registers the Safes that held execute before Safe processes existed, and the ones whose
 * registration failed on a grant. A grantee with a non-Safe plugin row is skipped without a chain read.
 *
 * `EXECUTE=true` to apply, `TARGET_NETWORK` to limit to one network.
 */
export const RegisterSafeProcesses: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    const execute = process.env.EXECUTE === 'true'
    const targetNetwork = process.env.TARGET_NETWORK as NetworksEnum | undefined
    if (targetNetwork && !Object.values(NetworksEnum).includes(targetNetwork)) {
      throw new Error(`Invalid TARGET_NETWORK value: ${targetNetwork}`)
    }

    const grants = await findHeldExecuteGrants(targetNetwork)
    logger.info('RegisterSafeProcesses scan', llo({ heldExecuteGrants: grants.length, execute }))

    if (!execute) {
      logger.info('RegisterSafeProcesses dry run, set EXECUTE=true to apply', llo({}))
      return
    }

    let registered = 0
    let ownersAdded = 0
    let ownersFailed = 0
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
        const plugin = await SafeProcessModule.install(whereAddress, whoAddress, info)
        if (!plugin) continue

        const owners = await new SafeGovernance(plugin.address, network).reconcileOwners()
        ownersAdded += owners.added
        ownersFailed += owners.failed

        if (conditionAddress) {
          await PluginHandler.updateConditionAddress(whoAddress, whereAddress, network, conditionAddress)
        } else {
          await PluginHandler.clearConditionAddress(whoAddress, whereAddress, network)
        }
        registered += 1
      } catch (error) {
        failed += 1
        logger.error('RegisterSafeProcesses grant failed', llo({ network, whereAddress, whoAddress, error }))
      }
    }

    logger.info(
      'RegisterSafeProcesses End',
      llo({ scanned: grants.length, registered, ownersAdded, ownersFailed, failed }),
    )
    if (failed > 0 || ownersFailed > 0) process.exit(1)
  },

  stop: async () => {},
}

export default RegisterSafeProcesses
