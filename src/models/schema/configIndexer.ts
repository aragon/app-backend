import { index, modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import {
  ICollectionNames,
  type IConfigIndexerIdParams,
  type IEnumIndexerService,
  IndexerType,
  IPluginInterfaceType,
  ITransactionType,
  NetworksEnum,
} from '@types'
import { assert } from '@errors'

const customName = ICollectionNames.ConfigIndexer

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
@index({ id: 1 }, { unique: true })
@index({ network: 1, lastSync: 1 })
@index({ lastSync: 1 })
@index({ end: -1 })
export default class ConfigIndexer extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public service!: string

  @prop({ type: () => Number, default: 0 })
  public lastSync!: number

  @prop({ type: () => Boolean, default: false })
  public end!: boolean

  static async create(rawData: Partial<ConfigIndexer>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.service, 'service is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        service: rawData?.service!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IConfigIndexerIdParams) {
    const entityId = `${params.network}-${params.service}`
    return entityId
  }

  static async findExistingLog(params: IConfigIndexerIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  async update(params: Partial<ConfigIndexer>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          const parsedObj = this.toObject()

          if (!_.isEqual(parsedObj[key], value)) {
            this[key] = value
          }
        }
      }
    })

    return this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return this.model(customName).findById(this._id, tOpts).exec()
  }

  extractInfoFromServiceName() {
    const parts = this.service.split('-')
    const firstPart = parts[0]

    // Check if it's a transaction type first
    const transactionTypes = Object.values(ITransactionType)
    if (transactionTypes.includes(firstPart as ITransactionType)) {
      return {
        indexerType: IndexerType.daoTransactions,
        transactionType: firstPart as ITransactionType,
        daoAddress: parts[1],
        indexerService: parts[2] as IEnumIndexerService,
      }
    }

    // Handle other specific types
    switch (firstPart) {
      case 'indexer': {
        // indexer-{network} - network might have hyphens
        return {
          indexerType: IndexerType.indexer,
          network: parts.slice(1).join('-') as NetworksEnum,
        }
      }

      case 'transferList': {
        // transferList-{address}-{network} - network is at the end
        const transferListAddress = parts[1]
        const transferListNetwork = parts.slice(2).join('-')
        return {
          indexerType: IndexerType.tokenTransfers,
          tokenAddress: transferListAddress,
          network: transferListNetwork as NetworksEnum,
        }
      }

      case 'dao': {
        // dao-{network}-{daoAddress} - network might have hyphens
        // Find the last part that looks like an address (starts with 0x)
        let daoAddressIndex = -1
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i].startsWith('0x')) {
            daoAddressIndex = i
            break
          }
        }
        if (daoAddressIndex === -1) return null

        return {
          indexerType: IndexerType.dao,
          network: parts.slice(1, daoAddressIndex).join('-') as NetworksEnum,
          daoAddress: parts[daoAddressIndex],
        }
      }

      default: {
        // Check if it's a plugin type
        const pluginTypes = Object.values(IPluginInterfaceType)
        if (pluginTypes.includes(firstPart as IPluginInterfaceType)) {
          // Find addresses (they start with 0x)
          const addresses = parts.filter(part => part.startsWith('0x'))

          if (addresses.length === 0) return null

          // Find the network (between plugin type and first address)
          const firstAddressIndex = parts.indexOf(addresses[0])
          const network = parts.slice(1, firstAddressIndex).join('-')

          if (addresses.length === 1) {
            // Plugin pattern: {pluginType}-{network}-{pluginAddress}
            return {
              indexerType: IndexerType.plugin,
              interfaceType: firstPart as IPluginInterfaceType,
              network: network as NetworksEnum,
              pluginAddress: addresses[0],
            }
          } else if (addresses.length === 2) {
            // Token pattern: {pluginType}-{network}-{pluginAddress}-{tokenAddress}
            return {
              indexerType: IndexerType.token,
              interfaceType: firstPart as IPluginInterfaceType,
              network: network as NetworksEnum,
              pluginAddress: addresses[0],
              tokenAddress: addresses[1],
            }
          }
        }

        return null
      }
    }
  }
}
