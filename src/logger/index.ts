import config from '@config'
import Utils from '@helpers/utils'
import { EnumLogLevel, type ILogger } from '@types'
import * as winston from 'winston'
import ExternalLogger from './external'
import Formats from './format'

const format = winston.format.combine(...[Formats.formatError(), winston.format.timestamp(), Formats.formatMachine()])

const externalLogger: any = new ExternalLogger({
  name: 'external-logger',
  level: EnumLogLevel.VERBOSE,
})

const consoleFormat = winston.format.combine(
  ...[winston.format.colorize(), Formats.consoleFormat({ showDetails: true })].filter(f => f !== null),
)

const consoleLogLevel = config.REMOTE_EXECUTION ? 'warn' : config.LOG.LEVEL
const consoleLogger = new winston.transports.Console({
  format: consoleFormat,
  level: consoleLogLevel,
})

const transports = [externalLogger, consoleLogger]

const logger: ILogger = winston.createLogger({
  level: EnumLogLevel.DEBUG,
  exitOnError: true,
  format,
  transports,
})

logger.purge = () => {
  /* istanbul ignore next */
  externalLogger.purge()
}

logger.logMeta = (...metas: object[]) => Object.assign({}, ...metas)

Utils.defaultError = (error: Error) => logger.error(error.message, { error })

export default logger
