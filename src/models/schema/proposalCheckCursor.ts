import { modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.ProposalCheckCursor

/**
 * Where the trigger router got to in each indexed collection it routes, by insertion order. The
 * indexer writes events out of chain order when it crawls history, so the cursor follows the
 * document ids, which only ever grow, not block numbers.
 */
@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
  },
  options: {
    customName,
  },
})
export default class ProposalCheckCursor extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  /** The `_id` of the last routed document, as a string; null before the first run. */
  @prop({ type: () => String, default: null })
  public lastId!: string | null

  static async read(id: string): Promise<string | null> {
    const cursor = (await this.findOne({ id })) as ProposalCheckCursor | null
    return cursor?.lastId ?? null
  }

  static async advance(id: string, lastId: string): Promise<void> {
    await this.updateOne({ id }, { $set: { lastId }, $setOnInsert: { id } }, { upsert: true })
  }
}
