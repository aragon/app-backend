import { setMongoModels } from '@models/utils/setModels'
import { type IMongoModel } from '@types'

export let Models: IMongoModel | any = {}

export const ModelProxy = {
  setMongoModels: async () => {
    const models = await setMongoModels()
    Models = { ...Models, ...models }
  },
}
