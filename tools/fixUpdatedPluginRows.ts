import { Models } from '@dbModels'
import { MetadataHandler } from '@handlers/metadataHandler'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { fixProposalCondition } from '@src/migrations/20261001225826-fixUpdatedPluginProposalCondition'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPluginType,
  IMetadataTargetField,
  IPluginStatus,
  type IService,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: FixUpdatedPluginRows' })

const findInstalledRows = (address: HexAddress, network: NetworksEnum) =>
  Models.Plugin.find({ network, address, status: IPluginStatus.installed })

const fixPlugin = async (address: HexAddress, network: NetworksEnum, execute: boolean) => {
  const [installedRows, updates] = await Promise.all([
    findInstalledRows(address, network),
    Models.LogPluginSetupProcessor.find({
      network,
      pluginAddress: address,
      event: IEventLogPluginType.UpdateApplied,
    }).sort({ blockNumber: 1, transactionIndex: 1, logIndex: 1 }),
  ])
  const lastUpdate = updates[updates.length - 1]

  if (installedRows.length > 1) {
    logger.error('Skipped plugin, it has more than one installed row', llo({ address, network }))
    return
  }

  const installed = installedRows[0]
  if (!installed || installed.transactionHash === lastUpdate.transactionHash) return

  const updatedRow = await Models.Plugin.findOne({ network, address, transactionHash: lastUpdate.transactionHash })

  if (!updatedRow) {
    logger.info('Replay the missing update', llo({ address, network, update: lastUpdate.transactionHash, execute }))
    if (!execute) return

    await PluginHandler.updatePlugin(lastUpdate)

    const replayed = await findInstalledRows(address, network)
    if (
      replayed.length !== 1 ||
      replayed[0].transactionHash !== lastUpdate.transactionHash ||
      replayed[0].isSupported !== installed.isSupported
    ) {
      logger.error('Replay did not install the update', llo({ address, network, update: lastUpdate.transactionHash }))
    }
    return
  }

  logger.info(
    'Mark the update row installed',
    llo({ address, network, from: installed.transactionHash, to: updatedRow.transactionHash, execute }),
  )
  if (!execute) return

  const inheritedProperties = PluginHandler._getInheritedProperties(installed, updatedRow)

  await DbTx.executeTxFn(async ({ session }) => {
    await Models.Plugin.updateOne(
      { _id: installed._id },
      {
        $set: {
          status: IPluginStatus.deprecated,
          isSupported: false,
          uninstalled: {
            status: true,
            blockNumber: updatedRow.blockNumber,
            blockTimestamp: updatedRow.blockTimestamp,
            transactionHash: updatedRow.transactionHash,
          },
        },
      },
      { session },
    )

    await Models.Plugin.updateOne(
      { _id: updatedRow._id },
      {
        $set: {
          ...inheritedProperties,
          status: IPluginStatus.installed,
          uninstalled: { status: false, blockNumber: null, blockTimestamp: null, transactionHash: null },
        },
      },
      { session },
    )

    await session.commitTransaction()
    await session.endSession()
  })
}

const applyLatestMetadata = async (address: HexAddress, network: NetworksEnum) => {
  const lastSavedMetadata = await Models.LogMetadata.getLatestMetadata(
    network,
    address,
    IMetadataTargetField.pluginAddress,
  )
  if (lastSavedMetadata) await MetadataHandler._updatePluginMetadata(lastSavedMetadata)
}

/**
 * Plugins whose last applied update is not the installed row: the update row is marked deprecated while the
 * row before it is still installed, or the update row was never written. With `EXECUTE=true` it also applies the
 * latest metadata and the proposal condition to every updated plugin, so a rerun finishes what a failed run left.
 *
 * An UpdateApplied with no UpdatePrepared log cannot be replayed here; that block has to be crawled again.
 *
 * `EXECUTE=true` to apply; without it the tool only logs what it would change.
 */
export const FixUpdatedPluginRows: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const execute = process.env.EXECUTE === 'true'

    const updatedPlugins = await Models.LogPluginSetupProcessor.aggregate([
      { $match: { event: IEventLogPluginType.UpdateApplied } },
      { $group: { _id: { network: '$network', address: '$pluginAddress' } } },
    ])

    for (const { _id } of updatedPlugins) {
      try {
        await fixPlugin(_id.address, _id.network, execute)
        if (execute) {
          await applyLatestMetadata(_id.address, _id.network)
          await fixProposalCondition(_id.address, _id.network)
        }
      } catch (error) {
        logger.error('Failed to fix plugin', llo({ address: _id.address, network: _id.network, error }))
      }
    }

    logger.info('FixUpdatedPluginRows done', llo({ plugins: updatedPlugins.length, execute }))
  },

  stop: async () => {},
}

export default FixUpdatedPluginRows
