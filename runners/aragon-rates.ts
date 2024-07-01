import { loadConfig } from '../config/environment'

import Runner from '@modules/runner'
import AragonRatesService from '@services/aragon-rates'
loadConfig('.env.aragon-rates')

Runner([{ app: AragonRatesService }])
