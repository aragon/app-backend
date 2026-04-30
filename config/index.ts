import { type IConfig } from '@types'
import { getConfigObject } from './common'

export * from './constants'

const config: IConfig = getConfigObject(process.env)
export default config
