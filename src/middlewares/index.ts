import compose from 'koa-compose'
import bodyParser from 'koa-bodyparser'
import utilsMiddleware from './util'
import securityMiddleware from './security'
import loggerMiddleware from './logger'
import errorMiddleware from './error'
import JwtHelper from '@helpers/jwt'

export default (mainRouter: any, opts?: { useJWT: boolean }) => {
  const middlewares: any = []

  middlewares.push(loggerMiddleware())
  middlewares.push(errorMiddleware())
  middlewares.push(
    bodyParser({
      enableTypes: ['json', 'form', 'text'],
      jsonLimit: '8mb',
      textLimit: '8mb',
      formLimit: '8mb',
      onerror: utilsMiddleware.onBodyParserError,
    }),
  )

  if (opts?.useJWT) {
    middlewares.push(JwtHelper.readJWT())
  }

  middlewares.push(securityMiddleware())
  middlewares.push(mainRouter.routes())
  middlewares.push(mainRouter.allowedMethods())

  return compose(middlewares)
}
