import { loadConfig } from '../config/environment'

import Runner from '@modules/runner'
import AragonAPIService from '@services/aragon-api'
loadConfig('.env.aragon-api')

Runner([{ app: AragonAPIService }])
