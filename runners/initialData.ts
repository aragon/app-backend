import * as dotenv from 'dotenv'

import Runner from '@modules/runner'
import InitialData from '@src/../initialData/index'
dotenv.config({ path: '../.env.aragon-api' })

Runner([{ app: InitialData }])
