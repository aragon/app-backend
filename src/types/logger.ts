import { type Logger } from 'winston'
import type Transport from 'winston-transport'

export interface ILogger extends Logger {
  purge?: any
  logMeta?: any
}

export interface ExternalLoggerOptions extends Transport.TransportStreamOptions {
  name?: string
  level?: string
}

export interface ILogFormat {
  formatMeta: (...args: any[]) => any
  formatMachine: (...args: any[]) => any
  formatRecursiveError: (...args: any[]) => any
  formatError: (...args: any[]) => any
  consoleFormat: (...args: any[]) => any
}

export enum EnumLogLevel {
  VERBOSE = 'verbose',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}
