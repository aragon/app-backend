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
import Web3Utils from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('daoRegistered', llo({ parsedEvent }))

    const daoAddress = parsedEvent.args.dao
    const existingLog = await Models.LogDaoRegistry.findExistingLog(txLog.transactionHash, daoAddress)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoLog = {
          network,
          address: daoAddress,
          creatorAddress: parsedEvent.args.creator,
          ens: parsedEvent.args.subdomain,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogDaoRegistry.create(daoLog, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New DaoLog', llo({ daoLog }))
      })

      await DaoRegistryHandler.initiateNewDaoCreation(txLog.transactionHash, network)
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
    const allLogs = await Web3Utils.getTransactionReceipt(transactionHash, network)
    if (!allLogs) {
      logger.verbose('Transaction not found', llo({ transactionHash, network }))
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

  _pluginSetup: async (txReceipt: TransactionReceipt, transactionHash: HexAddress, network: NetworksEnum) => {
    const pluginSetupLog = Web3Utils.findLogsByName(
      txReceipt,
      IEventLogPluginType.InstallationPrepared,
      PluginSetupProcessor.abi,
    )

    if (!pluginSetupLog) {
      logger.verbose('PluginSetupProcessor not found', llo({ transactionHash, network }))
      return
    }

    await PluginSetupProcessorHandler.installationPrepared(pluginSetupLog.parsed!, pluginSetupLog.txLog, network)
  },

  _memberAdded: async (txReceipt: TransactionReceipt, transactionHash: HexAddress, network: NetworksEnum) => {
    const memberAddedLog = Web3Utils.findLogsByName(txReceipt, IEventLogMember.MembersAdded, Multisig.abi)

    if (!memberAddedLog) {
      const delegationChangedLog = Web3Utils.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      if (!delegationChangedLog) {
        logger.verbose('Invalid member log', llo({ transactionHash, network }))
        return
      }

      return await MemberHandler.delegateChanged(delegationChangedLog.parsed!, delegationChangedLog.txLog, network)
    } else {
      await MemberHandler.membersAdded(memberAddedLog.parsed!, memberAddedLog.txLog, network)
    }
  },
}
