import config from '@config'
import Utils from '@helpers/utils'
import * as Sentry from '@sentry/node'
import { type ExternalLoggerOptions } from '@types'
import * as logNodejs from 'logzio-nodejs'
import { type ILogzioLogger } from 'logzio-nodejs'
import Transport from 'winston-transport'
import Format from './format'
import { redactPayload, redactUrlKeys } from './redact'

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

    // Logging paths must never crash the app. Any throw during formatting,
    // serialization, redaction, or transport send is swallowed locally so a
    // broken log line cannot take down the caller. Each sink (logzio, sentry)
    // is guarded independently so one failing does not block the other.
    try {
      const msg = Format.formatMeta(info)

      // Redaction runs on a serialized snapshot so we never mutate the live
      // winston `info` object — winston shares that reference with the console
      // transport, and mutating Error instances on some libs (e.g. ethers)
      // crashes because of read-only own properties.
      if (this.logzioLogger) {
        try {
          const serialized = JSON.parse(Utils.JSONStringifyCircular(msg))
          redactPayload(serialized)
          this.logzioLogger.log(serialized)
        } catch {
          // swallow — never let a logzio serialization failure propagate
        }
      }

      if (info.level === 'error' && this.sentry != null && info.error instanceof Error && !info.error.exposeCustom_) {
        try {
          // Build a fresh Error with redacted message/stack so Sentry receives
          // nothing sensitive while the original Error stays untouched for any
          // downstream consumers / the console transport.
          const redactedError = new Error(redactUrlKeys(`${info.message} - ${info.error.message}`))
          if (typeof info.error.stack === 'string') {
            redactedError.stack = redactUrlKeys(info.error.stack)
          }
          const sentryExtra = JSON.parse(Utils.JSONStringifyCircular(info))
          redactPayload(sentryExtra)
          this.sentry.setExtra('info', sentryExtra)
          this.sentry.captureMessage(redactedError as unknown as string)
        } catch {
          // swallow — never let a sentry path failure propagate
        }
      }
    } finally {
      callback()
    }
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
