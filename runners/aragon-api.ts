import * as dotenv from 'dotenv'

import Runner from '@modules/runner'
import AragonAPIService from '@services/aragon-api'
dotenv.config({ path: '../.env.aragon-api' })

Runner([{ app: AragonAPIService }])
