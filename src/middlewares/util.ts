import type Koa from 'koa'
import { throwExposable } from '@errors'
import { ErrorKeyEnum } from '@types'
import { type IUtilMiddleware } from '@types'

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
