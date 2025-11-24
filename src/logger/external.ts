import Transport from 'winston-transport'
import * as logNodejs from 'logzio-nodejs'
import * as Sentry from '@sentry/node'
import Format from './format'
import config from '@config'
import { type ExternalLoggerOptions } from '@types'
import { type ILogzioLogger } from 'logzio-nodejs'
import Utils from '@helpers/utils'

// Error codes/patterns to skip sending to external logging services
const SKIPPED_ERROR_PATTERNS = {
  // MongoDB WriteConflict - transient error that should be retried, not logged externally
  writeConflict: {
    code: 112,
    codeName: 'WriteConflict',
    messagePattern: /Write conflict/i,
  },
}

/**
 * Check if an error should be skipped from external logging
 * These are typically transient errors that are expected and should be retried
 */
function shouldSkipExternalLogging(info: any): boolean {
  const error = info?.error
  if (!error) return false

  const { writeConflict } = SKIPPED_ERROR_PATTERNS

  // Check by error code
  if (error.code === writeConflict.code) return true

  // Check by codeName
  if (error.codeName === writeConflict.codeName) return true

  // Check by message pattern
  if (error.message && writeConflict.messagePattern.test(error.message)) return true

  return false
}

class ExternalLogger extends Transport {
  private readonly logzioLogger?: ILogzioLogger
  private readonly sentry?: typeof Sentry

  constructor(opts?: ExternalLoggerOptions) {
    super(opts)

    if (config.LOG.LOGZIO_KEY) {
      /* istanbul ignore next */
      this.logzioLogger = logNodejs.createLogger({
        token: config.LOG.LOGZIO_KEY,
        host: config.LOG.LOGZIO_HOST,
        type: config.LOG.LOGZIO_SERVER_NAME,
        protocol: 'https',
      })
    }

    if (config.LOG.SENTRY_DSN) {
      this.sentry = Sentry
      this.sentry.init({
        dsn: config.LOG.SENTRY_DSN,
        serverName: config.LOG.LOGZIO_SERVER_NAME,
        environment: config.ENVIRONMENT,
      })
    }
  }

  end(...args: any[]): any {
    return super.end(...args)
  }

  log(info: any, callback: () => void) {
    // Skip transient errors (like MongoDB WriteConflict) from external logging
    if (shouldSkipExternalLogging(info)) {
      callback()
      return
    }

    const msg = Format.formatMeta(info)

    if (this.logzioLogger) {
      this.logzioLogger.log(JSON.parse(Utils.JSONStringifyCircular(msg)))
    }

    if (info.level === 'error' && this.sentry != null && info.error instanceof Error && !info.error.exposeCustom_) {
      info.error.message = `${info.message} - ${info.error.message}`
      this.sentry.setExtra('info', info)
      this.sentry.captureMessage(info.error)
    }

    callback()
  }

  purge() {
    if (this.logzioLogger) {
      this.logzioLogger.sendAndClose()
    }

    if (this.sentry != null) {
      this.sentry.close()
    }

    return true
  }
}

export default ExternalLogger
