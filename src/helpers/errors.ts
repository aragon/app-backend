import { ErrorKeyEnum, type IErrorMap, type IErrorDetail, type IErrorConfig, type IExposableError } from '@types'

const ERRORS: IErrorMap = {
  [ErrorKeyEnum.invalidOrigin]: {
    status: 503,
    description: 'Not authorised',
  },
  [ErrorKeyEnum.tooBusy]: {
    status: 503,
    description: 'Server too busy',
  },
  [ErrorKeyEnum.unknownError]: {
    status: 500,
    description: 'Unknown error',
  },
  [ErrorKeyEnum.entityTooLarge]: {
    status: 413,
    description: 'The files you are trying to upload are too big',
  },
  [ErrorKeyEnum.accessDenied]: {
    status: 400,
    description: 'access denied',
  },
  [ErrorKeyEnum.notImplemented]: {
    status: 501,
    description: 'Not implemented',
  },
  [ErrorKeyEnum.alreadyExists]: {
    status: 400,
    description: 'The Entity already exists.',
  },
  [ErrorKeyEnum.methodNotAllowed]: {
    status: 405,
    description: 'The action you want to do is not allowed',
  },
  [ErrorKeyEnum.badParams]: {
    status: 400,
    description: 'Bad parameters',
  },
  [ErrorKeyEnum.notFound]: {
    status: 400,
    description: 'Not found',
  },
  [ErrorKeyEnum.pluginNotFound]: {
    status: 400,
    description: 'Plugin not found',
  },
  [ErrorKeyEnum.daoNotFound]: {
    status: 400,
    description: 'Dao not found',
  },
  [ErrorKeyEnum.proposalNotFound]: {
    status: 400,
    description: 'Proposal not found',
  },
  [ErrorKeyEnum.campaignInvalid]: {
    status: 400,
    description: 'Campaign is invalid or cannot be modified',
  },
  [ErrorKeyEnum.duplicateAddresses]: {
    status: 400,
    description: 'Duplicate addresses found in the members list',
  },
}

const throwError = (message: string, detail: IErrorDetail = {}) => {
  const err = new Error(message)

  Object.assign(err, detail)

  throw err
}

const throwExposable = (code: string, status?: number | null, description?: string | null, exposeMeta?: any) => {
  const error: IErrorConfig = ERRORS[code]
  if (!error) {
    throwError(ErrorKeyEnum.unknownErrorCode, {
      code,
      status,
      description,
      exposeMeta,
    })
  }
  const err: IExposableError = new Error(code)
  err.exposeCustom_ = true

  err.status = status ?? error.status
  err.description = description ?? error.description

  if (exposeMeta) {
    err.exposeMeta = exposeMeta
  }

  throw err
}

function castExposable(error: Error) {
  if ((error as IExposableError).exposeCustom_) {
    throw error
  }

  throwExposable(error.message, (error as IExposableError).status, (error as IExposableError).description)
}

function assert(condition: boolean, message: string, detail?: IErrorDetail) {
  if (!condition) {
    throwError(message, detail)
  }
}

function assertExposable(
  condition: boolean,
  code: string,
  status?: number | null,
  description?: string | null,
  exposeMeta?: any,
) {
  if (!condition) {
    throwExposable(code, status, description, exposeMeta)
  }
}

function bodyParserError(error: any) {
  if (error.type === 'entity.too.large') {
    throwExposable(ErrorKeyEnum.entityTooLarge)
  } else {
    throwExposable(ErrorKeyEnum.badParams, 400, error.message as string)
  }
}

export { throwError, throwExposable, bodyParserError, assert, assertExposable, castExposable, ERRORS }

/****
 HTTP ERROR CODES

 100 "continue"
 101 "switching protocols"
 102 "processing"
 200 "ok"
 201 "created"
 202 "accepted"
 203 "non-authoritative information"
 204 "no content"
 205 "reset content"
 206 "partial content"
 207 "multi-status"
 208 "already reported"
 226 "im used"
 300 "multiple choices"
 301 "moved permanently"
 302 "found"
 303 "see other"
 304 "not modified"
 305 "use proxy"
 307 "temporary redirect"
 308 "permanent redirect"
 400 "bad request"
 401 "unauthorized"
 402 "payment required"
 403 "forbidden"
 404 "not found"
 405 "method not allowed"
 406 "not acceptable"
 407 "proxy authentication required"
 408 "request timeout"
 409 "conflict"
 410 "gone"
 411 "length required"
 412 "precondition failed"
 413 "payload too large"
 414 "uri too long"
 415 "unsupported media type"
 416 "range not satisfiable"
 417 "expectation failed"
 418 "I'm a teapot"
 422 "unprocessable entity"
 423 "locked"
 424 "failed dependency"
 426 "upgrade required"
 428 "precondition required"
 429 "too many requests"
 431 "request header fields too large"
 500 "internal server error"
 501 "not implemented"
 502 "bad gateway"
 503 "service unavailable"
 504 "gateway timeout"
 505 "http version not supported"
 506 "variant also negotiates"
 507 "insufficient storage"
 508 "loop detected"
 510 "not extended"
 511 "network authentication required"
 */
