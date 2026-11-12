import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'
import { type Model } from 'mongoose'

const MIGRATION_NAME = '20261110132020-removeMemberEnsFromActions'
const BATCH = 500
const MEMBER_ENS_FIELDS = [
  'receiver.ens',
  'receiver.avatar',
  'receivers.ens',
  'receivers.avatar',
  'members.ens',
  'members.avatar',
]
// Decoded actions nest under `inputData.actions`, three levels deep at most.
const ACTION_PATHS = [
  'actions',
  'actions.inputData.actions',
  'actions.inputData.actions.inputData.actions',
  'actions.inputData.actions.inputData.actions.inputData.actions',
]
const llo = logger.logMeta.bind(null, { service: 'Migration: removeMemberEnsFromActions' })

export const removeMemberEnsFromActionsMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      for (const model of [Models.Proposal, Models.Transaction, Models.SafeTransaction]) {
        await removeMemberEnsFromActionsMigration._clean(model)
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION_NAME }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},

  async _clean(model: Model<any>) {
    const withMemberEns: Record<string, unknown>[] = []
    for (const path of ACTION_PATHS) {
      for (const field of MEMBER_ENS_FIELDS) {
        withMemberEns.push({ [`${path}.${field}`]: { $exists: true } })
      }
    }

    let updated = 0
    let writes: any[] = []
    const cursor = model.find({ $or: withMemberEns }, { actions: 1 }).lean().cursor()

    for await (const row of cursor) {
      removeMemberEnsFromActionsMigration._removeMemberEns(row.actions)
      writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { actions: row.actions } } } })

      if (writes.length === BATCH) {
        updated += (await model.collection.bulkWrite(writes)).modifiedCount
        writes = []
      }
    }
    if (writes.length > 0) {
      updated += (await model.collection.bulkWrite(writes)).modifiedCount
    }

    logger.info('Member ENS names removed', llo({ collection: model.collection.name, updated }))
  },

  // `sender` is the DAO, its name and avatar stay.
  _removeMemberEns(actions: any[]) {
    for (const action of actions) {
      delete action.receiver?.ens
      delete action.receiver?.avatar
      delete action.receivers?.ens
      delete action.receivers?.avatar
      for (const member of action.members ?? []) {
        delete member.ens
        delete member.avatar
      }
      if (action.inputData?.actions) {
        removeMemberEnsFromActionsMigration._removeMemberEns(action.inputData.actions)
      }
    }
  },
}

export default removeMemberEnsFromActionsMigration satisfies IMigration
