import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { IPermission } from '@src/types/permission'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  type IService,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
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

interface IAssociationDao {
  network: NetworksEnum
  daoAddress: HexAddress
  blockNumber: number
  transactionHash: HexAddress
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
        $expr: {
          $eq: [{ $toLower: '$whereAddress' }, { $toLower: '$daoAddress' }],
        },
        ...(network ? { network } : {}),
      },
    },
    { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
    {
      $group: {
        _id: {
          network: '$network',
          whereAddress: { $toLower: '$whereAddress' },
          whoAddress: { $toLower: '$whoAddress' },
        },
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

const findAssociationDaos = async (network?: NetworksEnum): Promise<IAssociationDao[]> => {
  const [settings, plugins] = await Promise.all([
    Models.Setting.find({
      status: ISettingStatus.active,
      stages: {
        $elemMatch: {
          plugins: { $elemMatch: { brandId: VotingBodyBrandIdentity.SAFE } },
        },
      },
      ...(network ? { network } : {}),
    })
      .select('network daoAddress blockNumber transactionHash')
      .lean(),
    Models.Plugin.find({
      interfaceType: IPluginInterfaceType.safe,
      ...(network ? { network } : {}),
    })
      .select('network daoAddress blockNumber transactionHash')
      .lean(),
  ])
  const daos = new Map<string, IAssociationDao>()

  for (const row of [...plugins, ...settings]) {
    try {
      const daoAddress = ethers.getAddress(row.daoAddress) as HexAddress
      daos.set(`${row.network}-${daoAddress}`, {
        network: row.network,
        daoAddress,
        blockNumber: row.blockNumber,
        transactionHash: row.transactionHash,
      })
    } catch (error) {
      logger.error(
        'RegisterSafeProcesses association DAO normalization failed',
        llo({ network: row.network, daoAddress: row.daoAddress, error }),
      )
    }
  }

  return [...daos.values()]
}

/**
 * Registers or repairs Safe process rows for held EXECUTE_PERMISSION grants, including grants from
 * before Safe processes existed and rows whose earlier registration or history refresh failed.
 * Non-Safe grantees are skipped without a chain read.
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

    const [grants, associationDaos] = await Promise.all([
      findHeldExecuteGrants(targetNetwork),
      findAssociationDaos(targetNetwork),
    ])
    logger.info(
      'RegisterSafeProcesses scan',
      llo({ heldExecuteGrants: grants.length, associationDaos: associationDaos.length, execute }),
    )

    if (!execute) {
      logger.info('RegisterSafeProcesses dry run, set EXECUTE=true to apply', llo({}))
      return
    }

    let registered = 0
    let failed = 0
    for (const grant of grants) {
      const { network } = grant
      let whereAddress: HexAddress
      let whoAddress: HexAddress
      let conditionAddress: HexAddress | null
      try {
        whereAddress = ethers.getAddress(grant.whereAddress) as HexAddress
        whoAddress = ethers.getAddress(grant.whoAddress) as HexAddress
        conditionAddress = grant.conditionAddress ? (ethers.getAddress(grant.conditionAddress) as HexAddress) : null
      } catch (error) {
        failed += 1
        logger.error(
          'RegisterSafeProcesses grant address normalization failed',
          llo({ network, whereAddress: grant.whereAddress, whoAddress: grant.whoAddress, error }),
        )
        continue
      }

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

        await SafeBodyMembersModule.reconcileOwners(whereAddress, network)

        // Replay matching conditions too, so selector rows are rebuilt after process repair.
        if (conditionAddress) {
          await PluginHandler.updateConditionAddress(whoAddress, whereAddress, network, conditionAddress, true)
        } else {
          await PluginHandler.clearConditionAddress(whoAddress, whereAddress, network)
        }
        registered += 1
      } catch (error) {
        failed += 1
        logger.error('RegisterSafeProcesses grant failed', llo({ network, whereAddress, whoAddress, error }))
      }
    }

    let reconciledDaos = 0
    for (const association of associationDaos) {
      const { network, daoAddress } = association
      try {
        const info: ILogInfo = {
          network,
          address: daoAddress,
          blockNumber: association.blockNumber,
          transactionHash: association.transactionHash,
          transactionIndex: 0,
          logIndex: 0,
          eventName: 'SafeAssociationBackfill',
        }
        await SafeBodyMembersModule.reconcileDaoAssociations(daoAddress, network, info)
        await SafeBodyMembersModule.reconcileOwners(daoAddress, network)
        reconciledDaos += 1
      } catch (error) {
        failed += 1
        logger.error('RegisterSafeProcesses association reconciliation failed', llo({ network, daoAddress, error }))
      }
    }

    logger.info(
      'RegisterSafeProcesses End',
      llo({ scanned: grants.length, registered, associationDaos: associationDaos.length, reconciledDaos, failed }),
    )
  },

  stop: async () => {},
}

export default RegisterSafeProcesses
