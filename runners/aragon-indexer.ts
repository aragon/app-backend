import * as dotenv from 'dotenv'

import Runner from '@modules/runner'
import AragonIndexerService from '@services/aragon-indexer'
dotenv.config({ path: '../.env.aragon-indexer' })

Runner([{ app: AragonIndexerService }])
