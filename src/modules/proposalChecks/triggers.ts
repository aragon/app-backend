import { Models } from '@dbModels'
import logger from '@logger'
import WatchedTargets from '@modules/proposalChecks/watchedTargets'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import { Types } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:triggers' })

/** How many newly indexed documents one run routes per source. */
export const TRIGGER_BATCH_SIZE = 200

interface IRoutable {
  _id: Types.ObjectId
  network: NetworksEnum
  blockNumber: number
  transactionHash: string
  logIndex: number
  addresses: string[]
}

/**
 * Routes newly indexed changes to the open proposals that depend on the changed address. The
 * indexer keeps writing permission and plugin setup events as before; this reads what it wrote
 * since the last run, by insertion order, looks each address up in the watched set and asks for
 * the current revision of every affected proposal again. A change older than a proposal's
 * latest evidence block is already reflected and is skipped. Code upgrades of watched targets
 * are not indexed as events, so they are not routed here; that is a named coverage limit.
 */
const ProposalCheckTriggers = {
  async run(): Promise<{ routed: number; refreshed: number }> {
    const permissions = await ProposalCheckTriggers._route('permission', ProposalCheckTriggers._permissions)
    const setups = await ProposalCheckTriggers._route('setup', ProposalCheckTriggers._setups)
    return { routed: permissions.routed + setups.routed, refreshed: permissions.refreshed + setups.refreshed }
  },

  async _route(
    source: 'permission' | 'setup',
    fetch: (after: string | null) => Promise<IRoutable[]>,
  ): Promise<{ routed: number; refreshed: number }> {
    const after = await Models.ProposalCheckCursor.read(source)
    const docs = await fetch(after)
    let refreshed = 0
    for (const doc of docs) {
      const watched = await Models.ProposalWatchedTarget.find({
        network: doc.network,
        address: { $in: doc.addresses.map(a => a.toLowerCase()) },
      })
      const proposalIds = [...new Set<string>(watched.flatMap((w: { proposalIds: string[] }) => w.proposalIds))]
      for (const proposalId of proposalIds) {
        const latest = await Models.ProposalAssessment.findOne(
          { proposalId },
          { 'captured.evidenceBlock': 1 },
          { sort: { generation: -1 } },
        )
        if (latest && latest.captured.evidenceBlock.number >= doc.blockNumber) continue
        const created = await WatchedTargets.refresh(proposalId, doc.network, {
          source,
          blockNumber: doc.blockNumber,
          transactionHash: doc.transactionHash,
          logIndex: doc.logIndex,
        })
        if (created) refreshed += 1
      }
      await Models.ProposalCheckCursor.advance(source, String(doc._id))
    }
    if (docs.length)
      logger.verbose('proposal checks: indexed changes routed', llo({ source, routed: docs.length, refreshed }))
    return { routed: docs.length, refreshed }
  },

  async _permissions(after: string | null): Promise<IRoutable[]> {
    const docs = await Models.DaoPermission.find(
      after ? { _id: { $gt: new Types.ObjectId(after) } } : {},
      {
        network: 1,
        blockNumber: 1,
        transactionHash: 1,
        logIndex: 1,
        daoAddress: 1,
        whereAddress: 1,
        whoAddress: 1,
        conditionAddress: 1,
      },
      { sort: { _id: 1 }, limit: TRIGGER_BATCH_SIZE },
    )
    return docs.map(d => ({
      _id: d._id as Types.ObjectId,
      network: d.network,
      blockNumber: d.blockNumber,
      transactionHash: d.transactionHash,
      logIndex: d.logIndex,
      addresses: [d.daoAddress, d.whereAddress, d.whoAddress, d.conditionAddress].filter((a): a is string => !!a),
    }))
  },

  async _setups(after: string | null): Promise<IRoutable[]> {
    const docs = await Models.LogPluginSetupProcessor.find(
      {
        event: {
          $in: [
            IEventLogPluginType.InstallationApplied,
            IEventLogPluginType.UpdateApplied,
            IEventLogPluginType.UninstallationApplied,
          ],
        },
        ...(after ? { _id: { $gt: new Types.ObjectId(after) } } : {}),
      },
      { network: 1, blockNumber: 1, transactionHash: 1, logIndex: 1, daoAddress: 1, pluginAddress: 1 },
      { sort: { _id: 1 }, limit: TRIGGER_BATCH_SIZE },
    )
    return docs.map(d => ({
      _id: d._id as Types.ObjectId,
      network: d.network,
      blockNumber: d.blockNumber,
      transactionHash: d.transactionHash,
      logIndex: d.logIndex,
      addresses: [d.daoAddress, d.pluginAddress].filter((a): a is string => !!a),
    }))
  },
}

export default ProposalCheckTriggers
