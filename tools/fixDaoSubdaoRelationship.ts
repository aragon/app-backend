import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import logger from '@logger'
import { LogPolicy } from '@services/aragon-plugins/logPolicy'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPolicyType,
  IEventLogPluginType,
  IPluginInterfaceType,
  IPluginStatus,
  type IService,
  NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:fixDaoSubdaoRelationship' })

const NETWORK = NetworksEnum.ethereumSepolia
const PARENT_DAO = '0xE8fd9Fe445A037ee07fb98FDD4b146d939140De5'
const SUB_DAOS = [
  '0x2491Ab6738bBccef4058e912e236A48Be4227452',
  '0x9D80B3585624ff501c4cc288Feee0EA24EF3e6c7',
  '0x97C582C18Ce33aA3135f56BB3A9D71480c9ed6a4',
]

export const FixDaoSubdaoRelationship: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Starting fixDaoSubdaoRelationship tool', llo())

    // Step 1: Update parent DAO with subDaos array
    await updateParentDao()

    // Step 2: Update each subDAO with parentDao reference
    await updateSubDaos()

    // Step 3: Find and process unknown plugins from these DAOs
    const allDaoAddresses = [PARENT_DAO, ...SUB_DAOS]
    await processUnknownPlugins(allDaoAddresses)

    logger.info('Finished fixDaoSubdaoRelationship tool', llo())
  },

  stop: async () => {},
}

async function updateParentDao() {
  const parentDao = await Models.Dao.findByAddress(PARENT_DAO, NETWORK)
  if (!parentDao) {
    logger.error('Parent DAO not found', llo({ address: PARENT_DAO, network: NETWORK }))
    return
  }

  await parentDao.update({ subDaos: SUB_DAOS })
  logger.info('Updated parent DAO with subDaos', llo({ address: PARENT_DAO, subDaos: SUB_DAOS }))
}

async function updateSubDaos() {
  for (const subDaoAddress of SUB_DAOS) {
    const subDao = await Models.Dao.findByAddress(subDaoAddress, NETWORK)
    if (!subDao) {
      logger.warn('SubDAO not found', llo({ address: subDaoAddress, network: NETWORK }))
      continue
    }

    await subDao.update({ parentDao: PARENT_DAO })
    logger.info('Updated subDAO with parentDao', llo({ address: subDaoAddress, parentDao: PARENT_DAO }))
  }
}

async function processUnknownPlugins(daoAddresses: HexAddress[]) {
  const unknownPlugins = await Models.Plugin.find({
    daoAddress: { $in: daoAddresses },
    network: NETWORK,
    interfaceType: IPluginInterfaceType.unknown,
  })

  if (unknownPlugins.length === 0) {
    logger.info('No unknown plugins found', llo({ daoAddresses }))
    return
  }

  logger.info('Found unknown plugins to process', llo({ count: unknownPlugins.length }))

  for (const plugin of unknownPlugins) {
    try {
      await processPlugin(plugin.address)
    } catch (error) {
      logger.error('Failed to process plugin', llo({ address: plugin.address, error }))
    }
  }
}

async function processPlugin(address: HexAddress) {
  logger.info('Processing plugin', llo({ address, network: NETWORK }))

  const pluginDb = await Models.Plugin.findOne({ address, network: NETWORK })
  if (!pluginDb) {
    logger.warn('Plugin not found', llo({ address, network: NETWORK }))
    return
  }

  await pluginDb.update({
    interfaceType: IPluginInterfaceType.router,
    isSupported: true,
    status: IPluginStatus.installed,
  })
  logger.info('Updated plugin to router type', llo({ address, network: NETWORK }))

  const updatedPlugin = await Models.Plugin.findOne({ address, network: NETWORK })
  if (!updatedPlugin) {
    logger.error('Failed to reload plugin after update', llo({ address, network: NETWORK }))
    return
  }

  const contractCreation = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, NETWORK)
  if (!contractCreation.blockNumber || !contractCreation.transactionHash) {
    logger.error('Failed to get contract creation info', llo({ address, network: NETWORK }))
    return
  }

  const info = {
    address,
    network: NETWORK,
    blockNumber: contractCreation.blockNumber,
    transactionHash: contractCreation.transactionHash,
    logIndex: 0,
    transactionIndex: 0,
    eventName: IEventLogPluginType.InstallationApplied,
  }

  const linkStatus = await PluginSettingHandler.linkPolicySourceAndModel(updatedPlugin, info)
  if (linkStatus) {
    await PluginSettingHandler.isSupported(updatedPlugin, info)
    logger.info('Linked policy source and model', llo({ address, network: NETWORK }))
  } else {
    logger.warn('Failed to link policy source and model', llo({ address, network: NETWORK }))
  }

  const setting = await Models.Setting.findActive({ pluginAddress: address, network: NETWORK })
  const sourceAddress = setting?.policy?.source?.address
  const modelAddress = setting?.policy?.model?.address

  if (sourceAddress) {
    await createLogPolicyRecord(sourceAddress)
  }

  if (modelAddress) {
    await createLogPolicyRecord(modelAddress)
  }

  await LogPolicy.start(address, NETWORK)
  logger.info('Synced policy events', llo({ address, network: NETWORK }))
}

async function createLogPolicyRecord(address: HexAddress) {
  const existingRecord = await Models.LogPolicy.findByAddress(address, NETWORK)
  if (existingRecord) {
    logger.info('LogPolicy record already exists', llo({ address, network: NETWORK }))
    return
  }

  const contractCreation = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, NETWORK)
  if (!contractCreation.blockNumber) {
    logger.error('Failed to get contract creation block number for LogPolicy', llo({ address, network: NETWORK }))
    return
  }

  await Models.LogPolicy.create({
    event: IEventLogPolicyType.DrainBalanceSourceDeployed,
    transactionHash: contractCreation.transactionHash,
    transactionIndex: 0,
    logIndex: 0,
    blockNumber: contractCreation.blockNumber,
    address,
    network: NETWORK,
  })

  logger.info('Created LogPolicy record', llo({ address, network: NETWORK, blockNumber: contractCreation.blockNumber }))
}

export default FixDaoSubdaoRelationship
