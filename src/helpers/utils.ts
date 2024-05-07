import type { HexAddress, IDao, IPermission } from '@types'
import { assert } from '@errors'
import async from 'async'

const Utils = {
  noop: (): number => 0,
  wait: async (time: number) => await new Promise(resolve => setTimeout(resolve, time)),
  zeroAddress: '0x0000000000000000000000000000000000000000' as HexAddress,

  defaultError(error: any): void {
    /* istanbul ignore next */
    console.error(error) // eslint-disable-line no-console
  },

  enumToObject(data: any) {
    return Object.keys(data).reduce((object, key) => {
      return {
        ...object,
        [key]: key,
      }
    }, {})
  },

  setImmediateAsync(fn: any, onError: any = Utils.defaultError): void {
    fn().catch(onError)
  },

  configParser(
    configSource: any = process.env,
    type: 'string' | 'array' | 'number' | 'bool',
    key: string,
    defaultValue?: any,
  ) {
    const val = configSource[key]

    function def(v: any) {
      return defaultValue === undefined ? v : defaultValue
    }

    switch (type) {
      case 'string': {
        return val || def('')
      }

      case 'array': {
        return val ? val.split(',') : def([])
      }

      case 'number': {
        if (!val) return def(0)
        return Number(val)
      }

      case 'bool': {
        return val ? val === 'true' : def(false)
      }

      default: {
        throw new Error('Unknown variable type')
      }
    }
  },

  JSONStringifyCircular(object: any): string {
    const cache: any[] = []
    return JSON.stringify(
      object,
      function (key: string, value: any) {
        if (typeof value === 'object' && value !== null) {
          if (cache.includes(value)) {
            return
          }
          cache.push(value)
        }
        return value
      },
      2,
    )
  },

  async asyncForEach(array: any[], fn: any, breakOnFalse = false): Promise<any[]> {
    const results: boolean[] = []
    for (let index = 0; index < array.length; index++) {
      const res = await fn(array[index], index, array)

      if (breakOnFalse && res === false) {
        break
      }
      results.push(res)
    }
    return results
  },

  setIntervalAsync({ fn, delay, onError }: { fn: any; delay: number; onError: any }) {
    let timeout: any
    let running = true
    let endPromise = Promise.resolve() as Promise<any>

    const errorHandler = onError || Utils.defaultError

    async function launchAndWait(fn: any, delay: number): Promise<any> {
      let resolveNoop = Utils.noop

      try {
        endPromise = new Promise(resolve => (resolveNoop = resolve)).catch(Utils.noop)

        await fn()
        resolveNoop()
      } catch (error) {
        errorHandler(error)
        resolveNoop()
      } finally {
        if (running) {
          timeout = setTimeout(async () => await launchAndWait(fn, delay), delay)
        }
      }
    }

    launchAndWait(fn, delay).catch(errorHandler)

    return async (wait = false) => {
      running = false
      clearTimeout(timeout)
      if (wait) {
        return await endPromise
      } else {
        return null
      }
    }
  },

  asyncMap: async (array: any[], fn: any, onError: any): Promise<any> => {
    assert(!!array && !!fn && !!onError, 'missing parameters')
    const tasks = array.map(element => async () => fn(element)) as any[]

    return Utils.asyncParallel(tasks, onError)
  },

  asyncParallel: async (tasks: Array<() => Promise<any>>, onError: (error: Error) => void): Promise<any[]> => {
    return await new Promise(resolve => {
      const wrappedTasks = tasks.map(task => async.reflect(task))

      const callback = (_: Error | null, results: Array<{ error?: Error; value?: any }>) => {
        const successResults = results.filter(result => result.value !== undefined).map(result => result.value)
        const errorResults = results.filter(result => result.error !== undefined).map(result => result.error)

        errorResults.forEach(error => onError(error!))
        resolve(successResults)
      }

      async.parallel(wrappedTasks, callback as any)
    })
  },

  generateRandomName(length = 10): string {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''

    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }

    return result
  },

  getDaoPermalink(dao: IDao): string {
    const path: any = {
      network: dao.network,
      address: dao.daoAddress,
    }

    if (dao.ens?.length > 0) {
      path.address = dao.ens
    }

    return `${path.network}-${path.address}`
  },

  parsePermissions(permissions: IPermission[]) {
    if (!permissions || permissions.length === 0) {
      return []
    }
    return permissions.map((w: IPermission | any) => {
      const permission = w.toObject()
      permission.operation = Number(permission.operation)
      return permission
    })
  },
}

export default Utils
