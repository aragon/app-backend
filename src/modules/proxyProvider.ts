import { type IWebSocketProvider } from '@src/types'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyProvider' })

export const createProviderProxy = (initialProvider: IWebSocketProvider) => {
  const isConnectionOpen = () => {
    return initialProvider.websocket && initialProvider.websocket.readyState === 1
  }

  const waitForConnection = async () => {
    return new Promise<void>(resolve => {
      const checkConnection = () => {
        if (isConnectionOpen()) {
          logger.verbose('connection open', llo({}))
          resolve()
        } else {
          logger.verbose('wait to reconnect', llo({}))
          setTimeout(checkConnection, 100) // Check every 100ms
        }
      }
      checkConnection()
    })
  }

  return new Proxy(initialProvider, {
    get(target, prop, receiver) {
      if (prop === 'updateProvider') {
        logger.verbose('processQueue', llo({ target, prop, receiver }))
        return (newProvider: IWebSocketProvider) => {
          logger.verbose('processQueue return', llo({ newProvider }))
          initialProvider = newProvider
        }
      }

      const value = Reflect.get(target, prop, receiver)

      if (typeof value === 'function') {
        return async (...args: any[]) => {
          if (!isConnectionOpen()) {
            logger.verbose(`Connection not open, waiting to call ${String(prop)}`, llo({ args }))
            await waitForConnection()
          }
          return value.apply(initialProvider, args)
        }
      }
      return value
    },
  })
}
