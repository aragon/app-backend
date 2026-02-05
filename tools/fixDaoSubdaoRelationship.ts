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
  MetadataEntityType,
} from '@types'
import IPFSModule from '@modules/ipfs'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import Web3Utils from '@helpers/web3Utils'

const llo = logger.logMeta.bind(null, { service: 'tool:fixDaoSubdaoRelationship' })

const NETWORK = NetworksEnum.ethereumSepolia

// Multiple DAO sets to fix
const DAO_SETS: { parent: HexAddress; subDaos: HexAddress[] }[] = [
  {
    parent: '0xEB4813f79E18bbd62F9222CC98F5049B872F5c04',
    subDaos: ['0x74e75f87B7514c09cF70bEd5B1982c7B34d6196c', '0xb8A55fb41bA5e8996F47e2C5E88EF8D4ef5a95A3'],
  },
  {
    parent: '0xE8fd9Fe445A037ee07fb98FDD4b146d939140De5',
    subDaos: [
      '0x2491Ab6738bBccef4058e912e236A48Be4227452',
      '0x9D80B3585624ff501c4cc288Feee0EA24EF3e6c7',
      '0x97C582C18Ce33aA3135f56BB3A9D71480c9ed6a4',
    ],
  },
]

export const FixDaoSubdaoRelationship: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Starting fixDaoSubdaoRelationship tool', llo())

    for (const daoSet of DAO_SETS) {
      logger.info('Processing DAO set', llo({ parent: daoSet.parent, subDaos: daoSet.subDaos }))

      // Step 1: Update parent DAO with subDaos array
      await updateParentDao(daoSet.parent, daoSet.subDaos)

      // Step 2: Update each subDAO with parentDao reference
      await updateSubDaos(daoSet.parent, daoSet.subDaos)

      // Step 3: Find and process unknown plugins from these DAOs
      const allDaoAddresses = [daoSet.parent, ...daoSet.subDaos]
      await processUnknownPlugins(allDaoAddresses)
    }

    // Step 4: Fix Gauge plugin settings
    await fixGaugePluginSettings()
    await fixMetadataOfPolicies()

    logger.info('Finished fixDaoSubdaoRelationship tool', llo())
  },

  stop: async () => {},
}

async function fixMetadataOfPolicies() {
  const policies = await Models.Plugin.find({ network: NETWORK, isPolicy: true })

  for (const policy of policies) {
    if (!policy.metadataIpfs) {
      logger.warn('Policy has no metadataIpfs, skipping', llo({ address: policy.address }))
      continue
    }

    if (policy.processKey) {
      logger.info(
        'Policy already has processKey, skipping',
        llo({ address: policy.address, processKey: policy.processKey }),
      )
      continue
    }

    const ipfsMetadata = await IPFSModule.fetchMetadata(policy.metadataIpfs, {
      retries: 2,
      onFetchFailed: MetadataRefetchHelper.createFailedCallback(MetadataEntityType.Plugin, policy.address, NETWORK),
    })

    if (!ipfsMetadata) {
      logger.warn('Failed to fetch IPFS metadata for policy', llo({ address: policy.address }))
      continue
    }

    const parsedMetadata = Web3Utils.parseDaoMetadata(ipfsMetadata)

    if (!parsedMetadata.processKey) {
      logger.warn('No processKey found in parsed metadata', llo({ address: policy.address }))
      continue
    }

    await policy.update({ processKey: parsedMetadata.processKey })
    logger.info('Updated Plugin processKey', llo({ address: policy.address, processKey: parsedMetadata.processKey }))

    const logMetadataRecords = await Models.LogMetadata.find({
      pluginAddress: policy.address,
      network: NETWORK,
    })

    for (const logMeta of logMetadataRecords) {
      await logMeta.update({ processKey: parsedMetadata.processKey })
    }

    logger.info('Updated LogMetadata processKey', llo({ address: policy.address, count: logMetadataRecords.length }))
  }
}

async function fixGaugePluginSettings() {
  const pluginAddresses = ['0xB81d5F0f8B441Af365dbB3C6E92E7b2DCe57e85D', '0x1d8b09B564c931153aDd628187D21085AFf34199']
  const network = NETWORK

  for (const pluginAddress of pluginAddresses) {
    const pluginDb = await Models.Plugin.findOne({ address: pluginAddress, network })
    if (!pluginDb) {
      logger.info('Plugin not found before update', llo({ address: pluginAddress, network }))
      return
    }

    if (pluginDb.interfaceType !== IPluginInterfaceType.gauge || pluginDb.votingEscrow?.escrowAddress === null) {
      logger.info('Plugin is not a gauge or votingEscrow already set to null', llo({ address: pluginAddress, network }))
      return
    }

    const settingDb = await Models.Setting.findActive({ pluginAddress: pluginAddress, network })
    if (!settingDb) {
      logger.info('Setting not found', llo({ address: pluginAddress, network }))
      return
    }

    settingDb.votingEscrow = await PluginSettingHandler.votingEscrowSettings(pluginDb, {
      address: pluginAddress,
      network,
      blockNumber: pluginDb.blockNumber ?? 0,
      transactionHash: pluginDb.transactionHash ?? '',
      logIndex: 0,
      transactionIndex: 0,
      eventName: IEventLogPluginType.InstallationApplied,
    })

    await settingDb.save()
    logger.info('Updated votingEscrow settings in Setting', llo({ address: pluginAddress, network }))
  }
}

async function updateParentDao(parentDaoAddress: HexAddress, subDaoAddresses: HexAddress[]) {
  const parentDao = await Models.Dao.findByAddress(parentDaoAddress, NETWORK)
  if (!parentDao) {
    logger.error('Parent DAO not found', llo({ address: parentDaoAddress, network: NETWORK }))
    return
  }

  await parentDao.update({ subDaos: subDaoAddresses })
  logger.info('Updated parent DAO with subDaos', llo({ address: parentDaoAddress, subDaos: subDaoAddresses }))
}

async function updateSubDaos(parentDaoAddress: HexAddress, subDaoAddresses: HexAddress[]) {
  for (const subDaoAddress of subDaoAddresses) {
    const subDao = await Models.Dao.findByAddress(subDaoAddress, NETWORK)
    if (!subDao) {
      logger.warn('SubDAO not found', llo({ address: subDaoAddress, network: NETWORK }))
      continue
    }

    await subDao.update({ parentDao: parentDaoAddress })
    logger.info('Updated subDAO with parentDao', llo({ address: subDaoAddress, parentDao: parentDaoAddress }))
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
