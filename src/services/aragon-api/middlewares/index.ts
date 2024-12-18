import compose from 'koa-compose'
import bodyParser from 'koa-bodyparser'
import utilsMiddleware from './util'
import securityMiddleware from './security'
import loggerMiddleware from './logger'
import errorMiddleware from './error'

export default (mainRouter: any) =>
  compose([
    loggerMiddleware(),
    errorMiddleware(),

    bodyParser({
      enableTypes: ['json', 'form', 'text'],
      jsonLimit: '8mb',
      textLimit: '8mb',
      formLimit: '8mb',
      onerror: utilsMiddleware.onBodyParserError,
    }),

    securityMiddleware(),
    mainRouter.routes(),
    mainRouter.allowedMethods(),
  ])
