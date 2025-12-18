import MainAdminRouter from '@admin-api/routers/index'
import config from '@config'
import logger from '@logger'
import MainMiddleware from '@middlewares/index'
import Koa from 'koa'

const llo = logger.logMeta.bind(null, { service: 'admin-api' })

const AdminAPI = async (): Promise<Koa> =>
  await new Promise(resolve => {
    const app = new Koa()
    app.on('error', (error: any) => logger.error('Unexpected API error', llo({ error })))

    app.use(MainMiddleware(MainAdminRouter.router(), { useJWT: true }))

    const server = app.listen(config.SERVICES.ARAGON_ADMIN_API.PORT)
    logger.info('Listening', llo({ port: config.SERVICES.ARAGON_ADMIN_API.PORT }))
    resolve(app)

    server.setTimeout(config.SERVICES.ARAGON_ADMIN_API.TIMEOUT * 1000)
  })

export default AdminAPI
