import { type IWebSocketProvider } from '@src/types'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyProvider' })

interface QueueItem {
  method: (...args: any[]) => Promise<any>
  args: any[]
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}

export const createProviderProxy = (initialProvider: IWebSocketProvider) => {
  const callQueue: QueueItem[] = []
  let isConnected = false

  const isConnectionOpen = () => {
    return initialProvider.websocket && initialProvider.websocket.readyState === 1
  }

  // Process all queued calls
  const processQueue = () => {
    logger.verbose('Processing queued operations...', llo({ queueLength: callQueue.length }))
    while (callQueue.length > 0) {
      const { method, args, resolve, reject } = callQueue.shift()!
      method(...args)
        .then(resolve)
        .catch(reject)
    }
  }

  return new Proxy(initialProvider, {
    get(target, prop, receiver) {
      if (prop === 'updateProvider') {
        // Special handler to manage the update and reconnection logic
        return (newProvider: IWebSocketProvider) => {
          target = newProvider
          const newState = isConnectionOpen()
          if (!isConnected && newState) {
            // If was disconnected and now is connected, process the queue
            logger.verbose('processQueue', llo({}))
            processQueue()
          }
          isConnected = newState
        }
      }

      const value = Reflect.get(target, prop, receiver)

      if (typeof value === 'function') {
        return (...args: any[]) => {
          if (!isConnectionOpen()) {
            logger.verbose(`Connection not open, queuing ${String(prop)}`, llo({ args }))
            return new Promise((resolve, reject) => {
              callQueue.push({ method: value.bind(target), args, resolve, reject })
            })
          }
          return value.apply(target, args)
        }
      }
      return value
    },
  })
}
