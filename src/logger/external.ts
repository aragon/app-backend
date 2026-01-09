import config from '@config'
import Utils from '@helpers/utils'
import * as Sentry from '@sentry/node'
import { type ExternalLoggerOptions } from '@types'
import * as logNodejs from 'logzio-nodejs'
import { type ILogzioLogger } from 'logzio-nodejs'
import Transport from 'winston-transport'
import Format from './format'

// MongoDB transient transaction errors to skip from external logging
// These are expected errors that should be retried, not logged externally
// Aligned with DbTx.isErrorConflict() for consistency
const TRANSIENT_ERROR_PATTERNS = {
  // WriteConflict - concurrent write detected
  // Note: codeName is "WriteConflict" (no space), but error message contains "Write conflict" (with space)
  writeConflict: {
    code: 112,
    codeName: 'WriteConflict',
    messagePattern: /Write\s?conflict/i, // Matches both "WriteConflict" and "Write conflict"
  },
  // LockTimeout - transaction lock acquisition timeout
  lockTimeout: {
    codeName: 'LockTimeout',
  },
  // NoSuchTransaction - transaction no longer exists (already committed/aborted)
  noSuchTransaction: {
    codeName: 'NoSuchTransaction',
  },
}

/**
 * Check if an error should be skipped from external logging
 * These are typically transient MongoDB transaction errors that are expected and should be retried
 * Aligned with DbTx.isErrorConflict() for consistency
 */
function shouldSkipExternalLogging(info: any): boolean {
  const error = info?.error
  if (!error) return false

  const { writeConflict, lockTimeout, noSuchTransaction } = TRANSIENT_ERROR_PATTERNS

  // Check WriteConflict by error code
  if (error.code === writeConflict.code) return true

  // Check by codeName (WriteConflict, LockTimeout, NoSuchTransaction)
  if (
    error.codeName === writeConflict.codeName ||
    error.codeName === lockTimeout.codeName ||
    error.codeName === noSuchTransaction.codeName
  ) {
    return true
  }

  return error.message && writeConflict.messagePattern.test(error.message)
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
