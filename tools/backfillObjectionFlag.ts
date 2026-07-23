import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import PluginDetector from '@helpers/pluginDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import ProviderModule from '@modules/provider'
import { EnumConnection, type ILogInfo, IPluginInterfaceType, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:backfillObjectionFlag' })

// Objection plugins deployed before detection existed sit in the DB as plain tokenVoting rows.
// Real TokenVotings always have an event-derived Setting (VotingSettingsUpdated in initialize),
// objection plugins never emit one — so tokenVoting rows with no Setting entry are the candidates.
const MIN_BLOCK_NUMBER = 11327111

export const BackfillObjectionFlag: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const candidates = await Models.Plugin.aggregate([
      {
        $match: {
          interfaceType: IPluginInterfaceType.tokenVoting,
          isObjection: { $ne: true },
          blockNumber: { $gt: MIN_BLOCK_NUMBER },
        },
      },
      {
        $lookup: {
          from: 'Setting',
          let: { addr: '$address', net: '$network' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$pluginAddress', '$$addr'] }, { $eq: ['$network', '$$net'] }] } } },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'settings',
        },
      },
      { $match: { settings: { $size: 0 } } },
      { $project: { _id: 0, id: 1, address: 1, network: 1 } },
    ])
    logger.info('Backfill objection flag - candidates', llo({ count: candidates.length }))

    let flagged = 0
    for (const candidate of candidates) {
      const pluginInfo = await PluginDetector.detectPluginType(candidate.address, candidate.network)
      if (!pluginInfo?.isObjection) continue

      const plugin = await Models.Plugin.findByAddress(candidate.address, candidate.network)
      if (!plugin) continue

      const updated = await DbOperations.updateDocument(
        plugin,
        { isObjection: true },
        { logId: plugin.id },
        'Backfill objection flag',
        llo,
      )
      if (!updated) continue

      // Persist the live-proxied settings the plugin never emitted, read at the current block
      const latestBlock = await Web3Helper.getBlockNumber('latest', plugin.network)
      const info: ILogInfo = {
        address: plugin.address,
        network: plugin.network,
        blockNumber: latestBlock,
        transactionHash: plugin.transactionHash,
        transactionIndex: 0,
        logIndex: 0,
        eventName: 'backfillObjectionFlag',
      }
      const setting = await PluginSettingHandler.syncObjectionSetting(updated, info)
      if (!setting) {
        logger.warn('Objection flagged but setting sync failed', llo({ address: plugin.address }))
      }

      flagged++
      logger.info('Flagged objection plugin', llo({ address: plugin.address, network: plugin.network }))
    }

    logger.info('Backfill objection flag - done', llo({ candidates: candidates.length, flagged }))
  },

  stop: async () => {},
}

export default BackfillObjectionFlag
