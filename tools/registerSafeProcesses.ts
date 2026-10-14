import { Models } from '@dbModels'
import { SafeGovernance } from '@governance/safeGovernance'
import { PluginHandler } from '@handlers/pluginHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import SafeProcessModule from '@modules/safe/safeProcess'
import { type ILatestExecuteEvent, IPermission } from '@src/types/permission'
import {
  EnumConnection,
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  type IService,
  NetworksEnum,
} from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Tools: RegisterSafeProcesses' })

/**
 * EXECUTE_PERMISSION grants on the DAO itself that still stand: the newest event per
 * (network, where, who) is a Granted. A DAO also grants execute on other contracts, so `where` has to
 * be the emitting DAO.
 */
const findHeldExecuteGrants = async (network?: NetworksEnum): Promise<ILatestExecuteEvent[]> => {
  const events = await Models.DaoPermission.findLatestExecuteEvents({
    network,
    permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
  })
  return events.filter(event => event.event === IEventLogPermission.Granted)
}

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
    let skipped = 0
    let ownersAdded = 0
    let ownersFailed = 0
    let failed = 0
    let changed = 0
    for (const [index, grant] of grants.entries()) {
      const { network, whereAddress, whoAddress, conditionAddress } = grant
      try {
        const nonSafePlugin = await Models.Plugin.exists({
          network,
          address: whoAddress,
          interfaceType: { $ne: IPluginInterfaceType.safe },
        })
        if (nonSafePlugin) {
          skipped += 1
          continue
        }

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
        if (!plugin) {
          skipped += 1
          continue
        }

        const owners = await new SafeGovernance(plugin.address, network).reconcileOwners()
        ownersAdded += owners.added
        ownersFailed += owners.failed

        if (conditionAddress) {
          if (plugin.conditionAddress === conditionAddress) {
            await RabbitMQHelper.sendMessage(EnumQueueName.logSelectorPermission, {
              id: `${plugin.id}-${conditionAddress}`,
              params: { address: plugin.address, network, daoAddress: whereAddress, conditionAddress },
            })
          } else {
            await PluginHandler.updateConditionAddress(whoAddress, whereAddress, network, conditionAddress)
          }
        } else {
          await PluginHandler.clearConditionAddress(whoAddress, whereAddress, network)
        }
        registered += 1
      } catch (error) {
        failed += 1
        logger.error('RegisterSafeProcesses grant failed', llo({ network, whereAddress, whoAddress, error }))
      } finally {
        if ((index + 1) % 500 === 0) {
          logger.info(
            'RegisterSafeProcesses progress',
            llo({ index: index + 1, total: grants.length, registered, skipped, failed }),
          )
        }
      }
    }

    const daoRefs = new Map<
      string,
      { network: NetworksEnum; daoAddress: HexAddress; blockNumber: number; transactionHash: HexAddress }
    >()
    const candidates: {
      network: NetworksEnum
      daoAddress: HexAddress
      blockNumber: number
      transactionHash: HexAddress
    }[] = []
    for (const grant of grants) {
      candidates.push({
        network: grant.network,
        daoAddress: grant.whereAddress,
        blockNumber: grant.blockNumber,
        transactionHash: grant.transactionHash,
      })
    }

    const networks = targetNetwork ? [targetNetwork] : Object.values(NetworksEnum)
    for (const network of networks) {
      const settings = await Models.Setting.findWithSafeBody({ network })
      const rows = await Models.Plugin.findSafeAssociations({ network })
      for (const doc of [...settings, ...rows]) {
        if (!doc.daoAddress) continue
        candidates.push({
          network,
          daoAddress: doc.daoAddress,
          blockNumber: doc.blockNumber,
          transactionHash: doc.transactionHash,
        })
      }
    }

    for (const candidate of candidates) {
      const key = `${candidate.network}-${candidate.daoAddress}`
      const current = daoRefs.get(key)
      if (!current || candidate.blockNumber > current.blockNumber) {
        daoRefs.set(key, candidate)
      }
    }

    for (const { network, daoAddress, blockNumber, transactionHash } of daoRefs.values()) {
      const result = await SafeDaoAssociationsModule.reconcileDao(daoAddress, network, {
        blockNumber,
        transactionHash,
        transactionIndex: 0,
        logIndex: 0,
      })
      changed += result.changed
      failed += result.failed
    }

    logger.info(
      'RegisterSafeProcesses End',
      llo({ scanned: grants.length, registered, ownersAdded, ownersFailed, changed, failed }),
    )
    if (failed > 0 || ownersFailed > 0) process.exit(1)
  },

  stop: async () => {},
}

export default RegisterSafeProcesses
