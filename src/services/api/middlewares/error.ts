import { type Next } from 'koa'
import { type RouterContext } from '@koa/router'
import { ErrorKeyEnum, type ICustomError, type IErrorResponse } from '@types'

export default () => async(ctx: RouterContext, next: Next) => {
  try {
    await next()
  } catch (error: any) {
    ctx.requestInfo = Object.assign({ error }, ctx.requestInfo)

    let status = 500
    const response: IErrorResponse = {
      code: ErrorKeyEnum.unknownError, // Default error code
      description: 'Internal server error', // Default error message
    }

    if (error.exposeCustom_) {
      const customError = error as ICustomError
      status = customError.status || 500

      response.code =
        (ErrorKeyEnum as any)[customError.message] || ErrorKeyEnum.unknownError

      if (customError.description) {
        response.description = customError.description
      }
      if (customError.exposeMeta) {
        response.meta = customError.exposeMeta
      }
    }

    ctx.status = status
    ctx.body = response
  }
}
