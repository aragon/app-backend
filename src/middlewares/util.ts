import { throwExposable } from '@errors'
import { ErrorKeyEnum, type IUtilMiddleware } from '@types'
import type Koa from 'koa'

const UtilMiddleware: IUtilMiddleware = {
  noop: async (ctx: Koa.Context, next: Koa.Next) => await next(),

  onBodyParserError: (error: any) => {
    if (error.type === 'entity.too.large') {
      throwExposable(ErrorKeyEnum.entityTooLarge)
    } else {
      throwExposable(ErrorKeyEnum.badParams, 400, error.message)
    }
  },
}

export default UtilMiddleware
