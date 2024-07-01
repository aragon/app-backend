import * as dotenv from 'dotenv'

import Runner from '@modules/runner'
import AragonRatesService from '@services/aragon-rates'
dotenv.config({ path: '../.env.aragon-rates' })

Runner([{ app: AragonRatesService }])
