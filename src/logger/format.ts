import config from '@config'
import Utils from '@helpers/utils'
import { type ILogFormat } from '@types'
import * as os from 'os'
import * as process from 'process'
import * as winston from 'winston'

const LEVEL = Symbol.for('level')
const MESSAGE = Symbol.for('message')

const Format: ILogFormat = {
  formatMeta: (info: any) => {
    const filteredInfo = Object.assign({}, info)

    delete filteredInfo.level // eslint-disable-line
    delete filteredInfo.message // eslint-disable-line
    delete filteredInfo.machine // eslint-disable-line
    delete filteredInfo.splat // eslint-disable-line
    delete filteredInfo[LEVEL] // eslint-disable-line
    delete filteredInfo[MESSAGE] // eslint-disable-line

    const nbinfo = Object.keys(filteredInfo).length
    const newInfo: any = {
      level: info.level,
      message: info.message,
      machine: info.machine,
    }

    if (nbinfo) {
      newInfo.meta = filteredInfo
    }

    if (info.error) {
      newInfo.error = Format.formatRecursiveError(info)
    }

    return newInfo
  },

  formatMachine: winston.format(info => {
    info.machine = {
      hostname: os.hostname(),
      platform: process.platform,
      pid: process.pid,
    }

    info.environment = config.ENVIRONMENT
    info.tags = [config.LOG.LOGZIO_SERVER_NAME]

    return info
  }),

  formatRecursiveError(info: any) {
    if (info.error instanceof Error) {
      info.errorCode = info.error.code
      info.errorStack = info.error.stack
      info.errorMessage = info.error.message

      if (info.error.error instanceof Error) {
        info.errorDeep = {
          error: info.error.error,
        }

        info.errorDeep = Format.formatRecursiveError(info.errorDeep)
      }
    }

    return info
  },

  formatError: winston.format((info: any) => {
    return Format.formatRecursiveError(info)
  }),

  consoleFormat: winston.format((info: any, opts: { showDetails: any } | any) => {
    const filteredInfo = Object.assign({}, info)

    delete filteredInfo.level // eslint-disable-line
    delete filteredInfo.message // eslint-disable-line
    delete filteredInfo.splat // eslint-disable-line
    delete filteredInfo.timestamp // eslint-disable-line
    delete filteredInfo.machine // eslint-disable-line
    delete filteredInfo[LEVEL] // eslint-disable-line
    delete filteredInfo[MESSAGE] // eslint-disable-line

    let detailString = ''
    if (opts.showDetails && Object.keys(filteredInfo).length > 0) {
      const detail = Utils.JSONStringifyCircular(filteredInfo).replace(/\\n/g, '\n')
      detailString = `\nDetail : ${detail}`
    }

    info[MESSAGE] = `${info.timestamp} [${info.level}] ${info.message}${detailString}`
    return info
  }),
}

export default Format
