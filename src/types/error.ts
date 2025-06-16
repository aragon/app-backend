export interface ICustomError extends Error {
  status?: number
  exposeCustom_?: boolean
  description?: string
  exposeMeta?: any
}

export interface IErrorResponse {
  code: ErrorKeyEnum
  description: string
  status?: number
  meta?: any
}

export type IErrorDetail = Record<string, any>

export interface IExposableError extends Error {
  exposeCustom_?: boolean
  status?: number
  description?: string
  exposeMeta?: any
}

export interface IErrorConfig {
  status: number
  description: string
}

export type IErrorMap = Record<string, IErrorConfig>

export enum ErrorKeyEnum {
  invalidOrigin = 'invalidOrigin',
  tooBusy = 'tooBusy',
  unknownError = 'unknownError',
  entityTooLarge = 'entityTooLarge',
  accessDenied = 'accessDenied',
  notImplemented = 'notImplemented',
  alreadyExists = 'alreadyExists',
  methodNotAllowed = 'methodNotAllowed',
  badParams = 'badParams',
  unknownErrorCode = 'unknownErrorCode',
  notFound = 'notFound',
  daoNotFound = 'daoNotFound',
  pluginNotFound = 'pluginNotFound',
  proposalNotFound = 'proposalNotFound',
  tokenExpired = 'tokenExpired',
  blockscoutNotImplemented = 'blockscoutNotImplemented',
}
