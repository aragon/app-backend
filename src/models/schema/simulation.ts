import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import { ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import crypto from 'crypto'

const customName = ICollectionNames.Simulation

export enum SimulationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  RUNNING = 'running',
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
    allowMixed: Severity.ALLOW,
  },
})
@index({ proposalId: 1 })
@index({ runAt: -1 })
@index({ id: 1 })
@index({ "actions.to": 1, "actions.data": 1, "actions.value": 1 })
export default class Simulation extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: false })
  public proposalId?: string

  @prop({ type: () => String, enum: NetworksEnum, required: false })
  public network?: NetworksEnum

  @prop({ type: () => String, enum: SimulationStatus, required: true })
  public status!: SimulationStatus

  @prop({ type: () => String, required: false })
  public url?: string

  @prop({ type: () => Date, required: true })
  public runAt!: Date

  @prop({ type: () => Array, required: false })
  public actions?: any[]

  @prop({ type: () => String, required: false })
  public errorMessage?: string

  @prop({ type: () => String, required: false })
  public tenderlyResponse?: string

  static async create(rawData: Partial<Simulation>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      rawData.id = this.generateId(rawData.proposalId)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  /**
   * Generate a simulation ID
   * If proposalId is provided, use it as a prefix
   * If actions are provided, hash them to create a deterministic ID
   * Otherwise, use a timestamp
   */
  static generateId(proposalId?: string, actions?: any[]): string {
    // If proposalId is provided, use it as a prefix (backward compatibility)
    if (proposalId) {
      return `sim-${proposalId}-${Date.now()}`
    }

    // If actions are provided, create a hash of them for deterministic ID
    if (actions && actions.length > 0) {
      const actionsString = JSON.stringify(this.normalizeActions(actions))
      const hash = crypto.createHash('sha256').update(actionsString).digest('hex').substring(0, 16)
      return `sim-actions-${hash}`
    }
    
    // Fallback to timestamp
    return `sim-actions-${Date.now()}`
  }

  /**
   * Normalize actions for consistent hashing
   * This ensures the same actions always produce the same hash even if fields are in different order
   */
  static normalizeActions(actions: any[]): any[] {
    return actions.map(action => {
      // Extract only the fields we care about for hashing
      const { to, data, value } = action
      return { to, data, value }
    }).sort((a, b) => {
      // Sort by to address for consistent ordering
      if (a.to < b.to) return -1
      if (a.to > b.to) return 1
      
      // If to addresses are the same, sort by data
      if (a.data < b.data) return -1
      if (a.data > b.data) return 1
      
      // If data is the same, sort by value
      if (a.value < b.value) return -1
      if (a.value > b.value) return 1
      
      return 0
    })
  }

  static async findByProposalId(proposalId: string, tOpts?: SaveOptions) {
    return await this.findOne({ proposalId }, { sort: { runAt: -1 } }, tOpts)
  }
  
  /**
   * Find a simulation by its ID
   */
  static async findBySimulationId(id: string, tOpts?: SaveOptions) {
    return await this.findOne({ id }, null, tOpts)
  }
  
  /**
   * Find a simulation by the hash of its actions
   */
  static async findByActionsHash(actions: any[], tOpts?: SaveOptions) {
    const simulationId = this.generateId(undefined, actions)
    return await this.findBySimulationId(simulationId, tOpts)
  }

  static async upsertByProposalId(
    proposalId: string,
    updateData: Partial<Simulation>,
    tOpts?: SaveOptions,
  ): Promise<Simulation> {
    // Delete existing simulation to ensure only the latest
    await this.deleteOne({ proposalId })

    // Create new simulation
    return await this.create(
      {
        ...updateData,
        proposalId,
        runAt: new Date(),
      },
      tOpts,
    )
  }

  async update(params: Partial<Simulation>, tOpts?: SaveOptions) {
    Object.assign(this, params, { runAt: new Date() })
    return await this.save(tOpts)
  }
}
