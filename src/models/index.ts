import { setMongoModels } from '@models/utils/setModels'
import { type IMongoModel } from '@types'

export const Models: IMongoModel | any = {}

export const ModelProxy = {
  setMongoModels: async () => {
    const models = await setMongoModels()
    Object.assign(Models, models)
  },
}
