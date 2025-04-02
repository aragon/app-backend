import Koa from 'koa'
import MainMiddleware from '@middlewares/index'
import logger from '@logger'
import config from '@config'
import MainRouter from '@services/aragon-api/routers/index'

const llo = logger.logMeta.bind(null, { service: 'api' })

const API = async (): Promise<Koa> =>
  await new Promise(resolve => {
    const app = new Koa()
    app.on('error', (error: any) => logger.error('Unexpected API error', llo({ error })))

    app.use(MainMiddleware(MainRouter.router()))

    const server = app.listen(config.SERVICES.ARAGON_API.PORT)
    logger.info('Listening', llo({ port: config.SERVICES.ARAGON_API.PORT }))
    resolve(app)

    server.setTimeout(config.SERVICES.ARAGON_API.TIMEOUT * 1000)
  })

export default API
