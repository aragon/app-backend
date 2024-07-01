import { loadConfig } from '../config/environment'

import Runner from '@modules/runner'
import AragonIndexerService from '@services/aragon-indexer'
loadConfig('.env.aragon-indexer')

Runner([{ app: AragonIndexerService }])
