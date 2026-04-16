import * as dotenv from 'dotenv'
import * as path from 'path'

const isIntegration = process.argv.includes('--integration')
const envFile = isIntegration ? './integration.env' : './test.env'

dotenv.config({ path: path.resolve(__dirname, envFile) })
