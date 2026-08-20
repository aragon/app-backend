import logger from '@logger'
import MainMiddleware from '@middlewares/index'
import MainWorkspaceRouter from '@workspace/api'
import WorkspaceConfig from '@workspace/config'
import Koa from 'koa'

const llo = logger.logMeta.bind(null, { service: 'workspace-api' })

const WorkspaceAPI = async (): Promise<Koa> =>
  await new Promise(resolve => {
    const app = new Koa()
    app.on('error', (error: any) => logger.error('Unexpected workspace API error', llo({ error })))

    // No JWT: POC, internal only — docker-compose publishes this on loopback for
    // that reason. Anything that exposes the port needs auth first, since one
    // unauthenticated POST spends explorer, RPC and Envio budget.
    app.use(MainMiddleware(MainWorkspaceRouter.router(), { useJWT: false }))

    const server = app.listen(WorkspaceConfig.PORT)
    logger.info('Listening', llo({ port: WorkspaceConfig.PORT }))
    resolve(app)

    server.setTimeout(WorkspaceConfig.TIMEOUT * 1000)
  })

export default WorkspaceAPI
