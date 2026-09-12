import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, type IWatchedTargetKind, type NetworksEnum } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.ProposalWatchedTarget

/**
 * One document per address whose changes should re-assess the open proposals that depend on it:
 * the DAO, its plugins, the contracts the actions call, and the conditions on its permissions.
 * A target stays watched while any open proposal references it, whatever happens to the plugin
 * list; `registeredAtBlock` is the chain head when it was first registered, the point from which
 * live event routing takes over from replay.
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
@index({ network: 1, address: 1 }, { unique: true })
@index({ proposalIds: 1 })
export default class ProposalWatchedTarget extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public network!: NetworksEnum

  /** Lower-cased, so a checksum difference never doubles a target. */
  @prop({ type: () => String, required: true })
  public address!: string

  @prop({ type: () => [String], default: [] })
  public kinds!: IWatchedTargetKind[]

  @prop({ type: () => [String], default: [] })
  public proposalIds!: string[]

  @prop({ type: () => Number, required: true })
  public registeredAtBlock!: number

  static getEntityId(network: NetworksEnum, address: string): string {
    return `${network}-${address.toLowerCase()}`
  }

  /** Adds the proposal and the kinds to each target, creating the ones not watched yet at the given head. */
  static async register(
    network: NetworksEnum,
    targets: Array<{ address: string; kind: IWatchedTargetKind }>,
    proposalId: string,
    headBlock: number,
  ): Promise<void> {
    assert(!!proposalId, 'A watched target needs the proposal that depends on it')
    const byAddress = new Map<string, Set<IWatchedTargetKind>>()
    for (const target of targets) {
      const key = target.address.toLowerCase()
      if (!byAddress.has(key)) byAddress.set(key, new Set())
      byAddress.get(key)!.add(target.kind)
    }
    for (const [address, kinds] of byAddress) {
      await this.updateOne(
        { id: this.getEntityId(network, address) },
        {
          $setOnInsert: { id: this.getEntityId(network, address), network, address, registeredAtBlock: headBlock },
          $addToSet: { kinds: { $each: [...kinds] }, proposalIds: proposalId },
        },
        { upsert: true },
      )
    }
  }

  /** Forgets a proposal; a target nobody depends on any more is dropped. */
  static async release(proposalId: string): Promise<void> {
    await this.updateMany({ proposalIds: proposalId }, { $pull: { proposalIds: proposalId } })
    await this.deleteMany({ proposalIds: { $size: 0 } })
  }

  static async findByAddress(network: NetworksEnum, address: string): Promise<ProposalWatchedTarget | null> {
    return (await this.findOne({ id: this.getEntityId(network, address) })) as ProposalWatchedTarget | null
  }
}
