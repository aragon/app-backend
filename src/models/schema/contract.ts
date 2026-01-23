import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.Contract

export interface IContractIdParams {
  address: HexAddress
  network: NetworksEnum
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
  },
})
@index({ address: 1, network: 1 })
@index({ bytecodeHash: 1 })
export default class Contract extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, required: true })
  public bytecode!: string

  @prop({ type: () => String, required: true })
  public bytecodeHash!: string

  @prop({ type: () => String, default: null })
  public sourceCode!: string | null

  @prop({ type: () => String, default: null })
  public abi!: string | null

  @prop({ type: () => String, default: null })
  public contractName!: string | null

  @prop({ type: () => Boolean, default: false })
  public isVerified!: boolean

  @prop({ type: () => String, default: null })
  public compilerVersion!: string | null

  static async create(rawData: Partial<Contract>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({ address: rawData.address!, network: rawData.network! })
    }
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static getEntityId(params: IContractIdParams) {
    return `${params.address}-${params.network}`
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findExistingLog(params: IContractIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async getBytecode(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions): Promise<string | null> {
    const contract = await this.findOne({ address, network }, { bytecode: 1 }, tOpts)
    return contract?.bytecode ?? null
  }

  static async getSourceCode(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions): Promise<string | null> {
    const contract = await this.findOne({ address, network }, { sourceCode: 1 }, tOpts)
    return contract?.sourceCode ?? null
  }

  async update(params: Partial<Contract>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          if (this[key] !== value) {
            this[key] = value
          }
        }
      }
    })
    return this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return this.model(customName).findById(this._id, tOpts)
  }
}
