import { type IWebSocketProvider, IWebSocketStatus } from '@src/types'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyProvider' })

export const createProviderProxy = (initialProvider: IWebSocketProvider) => {
  let currentProvider = initialProvider

  const isConnectionOpen = () => {
    return currentProvider.websocket && currentProvider.websocket.readyState === IWebSocketStatus.OPEN
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
        logger.verbose('updateProvider', llo({ target, prop, receiver }))
        return (newProvider: IWebSocketProvider) => {
          logger.verbose('updating provider', llo({ newProvider }))
          currentProvider = newProvider
        }
      }

      const value = Reflect.get(target, prop, receiver)

      if (typeof value === 'function') {
        return async (...args: any[]) => {
          if (!isConnectionOpen()) {
            logger.verbose(`Connection not open, waiting to call ${String(prop)}`, llo({ args, prop: String(prop) }))
            await waitForConnection()
          }
          return value.apply(currentProvider, args)
        }
      }
      return value
    },
  })
}
