import logger from '@logger'
import { type HexAddress, IEventLogMember, IEventLogPluginType, type NetworksEnum } from '@types'
import { type LogDescription, type TransactionReceipt } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@services/indexer/handlers/pluginSetupProcessorHandler'
import { Multisig } from '@artifacts/Multisig'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import ProxyContractHelper from '@helpers/proxyContract'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const daoAddress = parsedEvent.args.dao
      const existingLog = await Models.LogDaoRegistry.findExistingLog(txLog.transactionHash, daoAddress)

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const implementationAddress = await ProxyContractHelper.getImplementationAddress(daoAddress, network)

          const daoLog = {
            network,
            address: daoAddress,
            creatorAddress: parsedEvent.args.creator,
            ens: parsedEvent.args.subdomain,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
            implementationAddress,
          }

          const logDb = await Models.LogDaoRegistry.create(daoLog, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New DaoRegister', llo({ logId: logDb.id, logInfo }))
        })

        await DaoRegistryHandler.initiateNewDaoCreation(txLog.transactionHash, network)
      }
    } catch (error) {
      logger.error('Error DaoRegister', llo({ logInfo, error }))
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

  initiateNewDaoCreation: async (transactionHash: HexAddress, network: NetworksEnum) => {
    const allLogs = await Web3Helper.getTransactionReceipt(transactionHash, network)
    if (!allLogs) {
      return
    }

    /**
     * Save the plugin Setup Processor logs that will create the plugin entry for the dao
     */
    await DaoRegistryHandler._pluginSetup(allLogs, transactionHash, network)

    /**
     * Save the member logs that will create the member entry for the dao
     */
    await DaoRegistryHandler._memberAdded(allLogs, transactionHash, network)
  },

  // TODO: add dao metadata on dao creation
  _pluginSetup: async (txReceipt: TransactionReceipt, transactionHash: HexAddress, network: NetworksEnum) => {
    const pluginSetupLogs = Web3Helper.findLogsByName(
      txReceipt,
      IEventLogPluginType.InstallationPrepared,
      PluginSetupProcessor.abi,
    )

    if (pluginSetupLogs.length === 0) {
      logger.verbose('PluginSetupProcessor not found', llo({ transactionHash, network }))
      return
    }

    await PluginSetupProcessorHandler.installationPrepared(
      pluginSetupLogs[0].parsed!,
      pluginSetupLogs[0].txLog,
      network,
    )
  },

  _memberAdded: async (txReceipt: TransactionReceipt, transactionHash: HexAddress, network: NetworksEnum) => {
    const memberAddedLogs = Web3Helper.findLogsByName(txReceipt, IEventLogMember.MembersAdded, Multisig.abi)

    if (memberAddedLogs.length === 0) {
      const delegationChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      if (delegationChangedLogs.length === 0) {
        logger.verbose('Invalid member log', llo({ transactionHash, network }))
        return
      }

      return await MemberHandler.delegateChanged(
        delegationChangedLogs[0].parsed!,
        delegationChangedLogs[0].txLog,
        network,
      )
    } else {
      await MemberHandler.membersAdded(memberAddedLogs[0].parsed!, memberAddedLogs[0].txLog, network)
    }
  },
}
