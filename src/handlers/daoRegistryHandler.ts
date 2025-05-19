import logger from '@logger'
import { EnumQueueName, type HexAddress, type ILogInfo } from '@types'
import { type LogDescription, type TransactionReceipt } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import ProxyContractHelper from '@helpers/proxyContract'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@src/handlers/metadataHandler'
import { ProxyMember } from '@modules/proxyMember'
import DbOperations from '@models/utils/dbOperations'
import Utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import EnsHelper from '@helpers/ens'

const llo = logger.logMeta.bind(null, { service: 'handlers:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { network, transactionHash, blockNumber } = info
    const daoAddress = parsedEvent.args.dao
    const subdomain = parsedEvent.args.subdomain

    const existingLog = await Models.Dao.findExistingLog({
      network,
      address: daoAddress,
    })
    if (existingLog) return

    const implementationAddress = await ProxyContractHelper.getImplementationAddress(daoAddress, network)
    const validSubdomain = Utils.validateString(subdomain)
    const ens = validSubdomain ? await EnsHelper.getDaoEns({ daoAddress, subdomain: validSubdomain }) : null

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
      ens,
      subdomain: validSubdomain,
      version: await Web3Helper.getDaoOsVersion(daoAddress, network),
      creatorAddress: parsedEvent.args.creator,
    }

    const dao = await DbOperations.createDocument(Models.Dao, document, info, 'New DaoRegistered', llo)

    await ProxyMember.createMember(parsedEvent.args.creator)
    await DaoRegistryHandler.initiateNewDaoCreation(info, dao.address)

    await RabbitMQHelper.sendMessage(EnumQueueName.logDao, {
      id: daoAddress,
      params: { address: daoAddress, network: info.network },
    })
  },

  nativeTransfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const dao = await Models.Dao.findByAddress(info.address, info.network)
    if (!dao) return

    await Promise.allSettled([
      RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
        id: dao.address,
        params: { address: dao.address, network: dao.network },
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
        id: dao.address,
        params: { address: dao.address, network: dao.network },
      }),
    ])

    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: dao.address,
      params: { address: dao.address, network: dao.network },
    })
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

    // always get dao transactions and assets
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
    const metadataLogs = Web3Utils.findLogsByName(txReceipt, 'MetadataSet', DAO.abi)

    if (!metadataLogs || metadataLogs?.length === 0) {
      logger.warn('MetadataSet not found', llo(info))
      return
    }

    const infoMetadata = Web3Utils.parseInfoLog(metadataLogs[0].txLog, 'MetadataSet', info.network)
    await MetadataHandler.metadataSet(metadataLogs[0].parsed!, infoMetadata)
  },

  handleVersionUpgrade: async (daoAddress: HexAddress, info: Partial<ILogInfo>) => {
    const [daoDb, txReceipt] = await Promise.all([
      Models.Dao.findByAddress(daoAddress, info.network),
      Web3Helper.getTransactionReceipt(info.transactionHash!, info.network!),
    ])

    if (!daoDb || !txReceipt) {
      logger.warn('Dao not found or tx receipt not found', llo(info))
      return
    }

    const versionUpgradeLogs = Web3Utils.findLogsByName(txReceipt, 'Upgraded', DAO.abi)
    const daoUpgradeLog = versionUpgradeLogs.find(event => event.txLog.address === daoAddress)
    if (!daoUpgradeLog) {
      return
    }

    const newImplementationAddress = daoUpgradeLog.parsed!.args.implementation
    const newVersion = await Web3Helper.getDaoOsVersion(newImplementationAddress, info.network!)

    if (!newVersion || newVersion === daoDb.version || daoDb.implementationAddress === newImplementationAddress) {
      return
    }

    await DbOperations.updateDocument(
      daoDb,
      { version: newVersion, implementationAddress: newImplementationAddress },
      info,
      'DaoVersion Upgraded',
      llo,
    )
  },
}
