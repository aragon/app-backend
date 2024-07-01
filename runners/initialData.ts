import { loadConfig } from '../config/environment'

import Runner from '@modules/runner'
import InitialData from '@src/../initialData/index'
loadConfig('.env.aragon-api')

Runner([{ app: InitialData }])
