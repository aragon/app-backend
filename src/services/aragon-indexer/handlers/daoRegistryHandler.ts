import logger from '@logger'
import { EnumQueueName, type HexAddress, IEventLogMember, IEventLogPluginType, type ILogInfo, ITokenType } from '@types'
import { type Log, type LogDescription, type TransactionReceipt } from 'ethers'
import { Models } from '@dbModels'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { Multisig } from '@artifacts/Multisig'
import { MultisigHandler } from '@indexer/handlers/multisigHandler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import ProxyContractHelper from '@helpers/proxyContract'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@services/aragon-indexer/handlers/metadataHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProxyMember } from '@modules/proxyMember'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'
import DbOperations from '@models/utils/dbOperations'
import Utils from '@helpers/utils'
import { RabbitMQHelper } from '@helpers/redditMQ'
import type Plugin from '@models/schema/plugin'
import { ProxyToken } from '@modules/proxyToken'
import { LogGovernanceErc20 } from '@indexer/logGovernanceErc20'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultisig } from '@indexer/logMultisig'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { network, transactionHash, blockNumber } = info
    const daoAddress = parsedEvent.args.dao

    const existingLog = await Models.Dao.findExistingLog({
      network,
      address: daoAddress,
    })
    if (existingLog) return

    const implementationAddress = await ProxyContractHelper.getImplementationAddress(daoAddress, network)
    const isValid = await Web3Helper.subdomainExists(parsedEvent.args.subdomain, network)

    const document = {
      network,
      transactionHash,
      blockNumber,
      isActive: true,
      isHidden: false,
      isSupported: false,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      address: daoAddress,
      implementationAddress: implementationAddress!,
      ens: isValid ? Web3Helper.parseSubdomainToEns(parsedEvent.args.subdomain) : null,
      subdomain: Utils.validateString(parsedEvent.args.subdomain),
      version: await Web3Helper.getDaoOsVersion(daoAddress, network),
      creatorAddress: parsedEvent.args.creator,
    }

    const dao = await DbOperations.createDocument(Models.Dao, document, info, 'New DaoRegistered', llo)
    await ProxyMember.saveAndGetMember(parsedEvent.args.creator)
    await DaoRegistryHandler.initiateNewDaoCreation(info, dao.address)
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

  initiateNewDaoCreation: async (info: ILogInfo, daoAddress: HexAddress) => {
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    if (!txReceipt) {
      return
    }

    /**
     * Save the metadata logs that will create the metadata entry for the dao
     */
    await DaoRegistryHandler._metadataHandler(txReceipt, info)

    /**
     * Save the plugin Setup Processor logs that will create the plugin entry for the dao
     */
    await DaoRegistryHandler._pluginSetup(txReceipt, info)

    /**
     * Save the plugin settings logs that will create the plugin settings entry for the dao
     * As settings can be identified in two ways, needed to check for both
     */
    const plugin = await DaoRegistryHandler._pluginSettings(txReceipt, info)

    if (plugin) {
      await DaoRegistryHandler._updateDaoAndSyncPluginData(plugin)
    }

    /**
     * Save the member logs that will create the member entry for the dao
     */
    await DaoRegistryHandler._memberAdded(txReceipt, info)

    await Promise.all([
      RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
        id: daoAddress,
        params: { address: daoAddress, network: info.network },
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
        id: daoAddress,
        params: { address: daoAddress, network: info.network },
      }),
    ])
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
    const installationTypes = [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied]

    for (const installationType of installationTypes) {
      const pluginSetupLogs = Web3Helper.findLogsByName(txReceipt, installationType, PluginSetupProcessor.abi)

      if (pluginSetupLogs.length === 0) {
        logger.warn('PluginSetupProcessor not found', llo(info))
        continue
      }

      const infoPluginSetup = Web3Helper.parseInfoLog(pluginSetupLogs[0].txLog, installationType, info.network)

      if (installationType === IEventLogPluginType.InstallationPrepared) {
        await PluginSetupProcessorHandler.installationPrepared(pluginSetupLogs[0].parsed!, infoPluginSetup)
      } else if (installationType === IEventLogPluginType.InstallationApplied) {
        await PluginSetupProcessorHandler.installationApplied(pluginSetupLogs[0].parsed!, infoPluginSetup)
      }
    }
  },

  _pluginSettings: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    const setting = Web3Helper.findLogsByName(txReceipt, 'MultisigSettingsUpdated', Multisig.abi)

    if (setting?.length) {
      const infoPluginSetup = Web3Helper.parseInfoLog(setting[0].txLog, 'MultisigSettingsUpdated', info.network)
      return await PluginSettingHandler.multisigSettingsUpdated(setting[0].parsed!, infoPluginSetup)
    }

    const votingSetting = Web3Helper.findLogsByName(txReceipt, 'VotingSettingsUpdated', TokenVoting.abi)

    if (votingSetting?.length) {
      const infoPluginSetup = Web3Helper.parseInfoLog(votingSetting[0].txLog, 'VotingSettingsUpdated', info.network)
      return await PluginSettingHandler.votingSettingsUpdated(votingSetting[0].parsed!, infoPluginSetup)
    }
  },

  _memberAdded: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    const memberAddedLogs = Web3Helper.findLogsByName(txReceipt, IEventLogMember.MembersAdded, Multisig.abi)
    if (memberAddedLogs.length > 0) {
      await Promise.all(
        memberAddedLogs.map(async (log: { parsed: LogDescription | null; txLog: Log }) => {
          const infoPluginSetup = Web3Helper.parseInfoLog(log.txLog, IEventLogMember.MembersAdded, info.network)
          await MultisigHandler.membersAdded(log.parsed!, infoPluginSetup)
        }),
      )
    }

    const delegationChangedLogs = Web3Helper.findLogsByName(
      txReceipt,
      IEventLogMember.DelegateVotesChanged,
      GovernanceERC20.abi,
    )
    if (delegationChangedLogs.length > 0) {
      await Promise.all(
        delegationChangedLogs.map(async (log: { parsed: LogDescription | null; txLog: Log }) => {
          const infoPluginSetup = Web3Helper.parseInfoLog(log.txLog, IEventLogMember.DelegateVotesChanged, info.network)
          await GovernanceErc20Handler.delegateVotesChanged(log.parsed!, infoPluginSetup)
        }),
      )
    }
  },

  _updateDaoAndSyncPluginData: async (plugin: Plugin) => {
    if (!plugin) return

    const dao = await Models.Dao.findByAddress(plugin.daoAddress, plugin.network)
    if (!dao) {
      logger.error('Dao not found', llo({ logId: plugin.id }))
      return
    }

    if (plugin.tokenAddress) {
      const token = await ProxyToken.saveAndGetToken(plugin.tokenAddress, plugin.network)
      if (token?.type === ITokenType.GovernanceERC20) {
        if (!dao.isSupported) {
          await DbOperations.updateDocument(
            dao,
            { isSupported: true },
            { logId: dao.id },
            'Dao Supported - setting fetched',
            llo,
          )
        }
        await Promise.all([LogGovernanceErc20.start(plugin), LogTokenVoting.start(plugin)])
      }
    } else {
      if (!dao.isSupported) {
        await DbOperations.updateDocument(
          dao,
          { isSupported: true },
          { logId: dao.id },
          'Dao Supported - setting fetched',
          llo,
        )
      }
      await Promise.all([LogMultisig.start(plugin)])
    }
  },
}
