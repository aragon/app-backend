import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, './test.env') })

process.env.NODE_ENV = 'test'
process.env.TS_NODE_TRANSPILE_ONLY = 'true' // Skip typ
