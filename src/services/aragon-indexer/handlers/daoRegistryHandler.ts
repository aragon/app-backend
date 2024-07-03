import logger from '@logger'
import { IEventLogMember, IEventLogPluginType, type ILogInfo } from '@types'
import { type LogDescription, type TransactionReceipt } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { Multisig } from '@artifacts/Multisig'
import { MemberHandler } from '@services/aragon-indexer/handlers/memberHandler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import ProxyContractHelper from '@helpers/proxyContract'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@services/aragon-indexer/handlers/metadataHandler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const daoAddress = parsedEvent.args.dao
      const existingLog = await Models.LogDaoRegistry.findExistingLog({
        transactionHash: info.transactionHash,
        address: daoAddress,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const implementationAddress = await ProxyContractHelper.getImplementationAddress(daoAddress, info.network)

          const daoLog = {
            network: info.network,
            address: daoAddress,
            creatorAddress: parsedEvent.args.creator,
            subdomain: parsedEvent.args.subdomain,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            implementationAddress: implementationAddress!,
          }

          const logDb = await Models.LogDaoRegistry.create(daoLog, { session } as any)
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New DaoRegister', llo({ ...info, logId: logDb.id }))
        })

        await DaoRegistryHandler.initiateNewDaoCreation(info)
      }
    } catch (error) {
      logger.error('Error DaoRegister', llo({ ...info, error }))
    }
  },

  /**
   * Initiate the new dao creation
   * @description
   * Everytime a new dao is created, the Dao DaoRegistered event is emitted.
   * Pretty before that event, the plugin setup and member added events are emitted.
   *
   * The dao creation has certain steps that need to be followed,
   * as the transaction logs has all the information which are needed
   * to create the other entities like members, plugins, etc.
   * This way we all link the entities related to the dao.
   *
   */

  initiateNewDaoCreation: async (info: ILogInfo) => {
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    if (!txReceipt) {
      return
    }

    /**
     * Save the plugin Setup Processor logs that will create the plugin entry for the dao
     */
    await DaoRegistryHandler._pluginSetup(txReceipt, info)

    /**
     * Save the member logs that will create the member entry for the dao
     */
    await DaoRegistryHandler._memberAdded(txReceipt, info)

    /**
     * Save the metadata logs that will create the metadata entry for the dao
     */
    await DaoRegistryHandler._metadataHandler(txReceipt, info)
  },

  _metadataHandler: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    const metadataLogs = Web3Helper.findLogsByName(txReceipt, 'MetadataSet', DAO.abi)

    if (!metadataLogs || metadataLogs?.length === 0) {
      logger.warn('MetadataSet not found', llo(info))
      return
    }

    const infoMetadata = Web3Helper.parseInfoLog(metadataLogs[0].txLog, 'MetadataSet', info.network)
    await MetadataHandler.metadataSet(metadataLogs[0].parsed!, infoMetadata)
  },

  _pluginSetup: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    await Promise.all(
      [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied].map(
        async installationType => {
          const pluginSetupLogs = Web3Helper.findLogsByName(txReceipt, installationType, PluginSetupProcessor.abi)

          if (pluginSetupLogs.length === 0) {
            logger.warn('PluginSetupProcessor not found', llo(info))
            return
          }

          const infoPluginSetup = Web3Helper.parseInfoLog(pluginSetupLogs[0].txLog, installationType, info.network)

          if (installationType === IEventLogPluginType.InstallationPrepared) {
            await PluginSetupProcessorHandler.installationPrepared(pluginSetupLogs[0].parsed!, infoPluginSetup)
          } else if (installationType === IEventLogPluginType.InstallationApplied) {
            await PluginSetupProcessorHandler.installationApplied(pluginSetupLogs[0].parsed!, infoPluginSetup)
          }
        },
      ),
    )
  },

  _memberAdded: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    const memberAddedLogs = Web3Helper.findLogsByName(txReceipt, IEventLogMember.MembersAdded, Multisig.abi)

    if (memberAddedLogs.length === 0) {
      const delegationChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      if (delegationChangedLogs.length === 0) {
        logger.warn('Invalid member log', llo(info))
        return
      }

      const infoPluginSetup = Web3Helper.parseInfoLog(
        delegationChangedLogs[0].txLog,
        IEventLogMember.DelegateChanged,
        info.network,
      )
      return await MemberHandler.delegateChanged(delegationChangedLogs[0].parsed!, infoPluginSetup)
    } else {
      const infoPluginSetup = Web3Helper.parseInfoLog(
        memberAddedLogs[0].txLog,
        IEventLogMember.DelegateChanged,
        info.network,
      )
      await MemberHandler.membersAdded(memberAddedLogs[0].parsed!, infoPluginSetup)
    }
  },
}
