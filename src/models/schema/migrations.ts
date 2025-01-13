import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.Migration

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
@index({
  name: 1,
  appliedAt: 1,
})
export default class Migration extends Model {
  @prop({ type: () => String })
  public name!: string

  @prop({ type: () => String })
  public appliedAt!: string
}
