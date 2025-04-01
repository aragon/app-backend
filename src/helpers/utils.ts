import { type HexAddress, type IIndexerConfig, type IPermission, NetworksEnum } from '@types'
import { assert } from '@errors'
import async from 'async'
import dayjs from '@helpers/dayjs'
import type Plugin from '@models/schema/plugin'

const Utils = {
  noop: (): number => 0,
  wait: async (time: number) => await new Promise(resolve => setTimeout(resolve, time)),
  zeroAddress: '0x0000000000000000000000000000000000000000' as HexAddress,

  aragonNetworkMap: {
    [NetworksEnum.ethereumMainnet]: 'ETHEREUM_MAINNET',
    [NetworksEnum.ethereumSepolia]: 'ETHEREUM_SEPOLIA',
    [NetworksEnum.polygonMainnet]: 'POLYGON_MAINNET',
    [NetworksEnum.baseMainnet]: 'BASE_MAINNET',
    [NetworksEnum.arbitrumMainnet]: 'ARBITRUM_MAINNET',
    [NetworksEnum.zksyncSepolia]: 'ZKSYNC_SEPOLIA',
    [NetworksEnum.zksyncMainnet]: 'ZKSYNC_MAINNET',
  },

  networkToAragon: (network: NetworksEnum) => Utils.aragonNetworkMap[network],

  poolingTime: (network: NetworksEnum) => {
    switch (network) {
      default:
        return 5 * 1000 // 5 seconds
    }
  },

  validateString(input: string | null | undefined): string | null {
    if (typeof input === 'string' && input.trim() !== '') {
      return input
    }
    return null
  },

  parseAvatar(avatar: any): string | null {
    return typeof avatar === 'string' ? avatar : null
  },

  getProtocolPrefixes(ssl: boolean): { wsPrefix: string; httpPrefix: string } {
    return {
      wsPrefix: ssl ? 'wss://' : 'ws://',
      httpPrefix: ssl ? 'https://' : 'http://',
    }
  },

  extractAdditionalParams: (
    knownParams: Record<string, any> = {},
    queryParams: Record<string, any> = {},
    skipKeys: string[] = [],
  ) => {
    const knownKeys = new Set<string>(Object.keys(knownParams))
    const skipKeysSet = new Set<string>(skipKeys)

    return Object.keys(queryParams)
      .filter(key => !knownKeys.has(key) && !skipKeysSet.has(key))
      .reduce<Record<string, any>>((obj, key) => {
        obj[key] = queryParams[key]
        return obj
      }, {})
  },

  chunkArray: (array: any[], size: number) => {
    if (!array || array.length === 0) {
      return [[]]
    }
    return array?.length > size
      ? Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, i * size + size))
      : [array]
  },

  lowercaseFirstLetter(str: string): string {
    if (!str) return str
    return str.charAt(0).toLowerCase() + str.slice(1)
  },

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

  setImmediateAsyncArray(fns: Array<() => Promise<any>>, onError: (error: any) => void = Utils.defaultError): void {
    for (const fn of fns) {
      setImmediate(() => {
        fn().catch(onError)
      })
    }
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
      function (_, value: any) {
        if (typeof value === 'bigint') {
          return value.toString()
        }
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
          timeout = setTimeout(async () => launchAndWait(fn, delay), delay)
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

  parsePermissions(permissions: IPermission[]) {
    if (!permissions || permissions.length === 0) {
      return []
    }
    return permissions.map((w: IPermission | any) => {
      let rawPermissions = w
      try {
        rawPermissions = w.toObject()
      } catch (_) {}
      rawPermissions.operation = Number(rawPermissions.operation)
      return rawPermissions
    })
  },

  hasHoursPassed(lastUpdated: Date, hours: number): boolean {
    return dayjs().diff(lastUpdated, 'hour') >= hours
  },

  calculatePercentageChange(newValue: number, oldValue: number): number {
    return parseFloat((((newValue - oldValue) / oldValue) * 100).toFixed(2))
  },

  getEpochDayjs(): dayjs.Dayjs {
    return dayjs.unix(0) // Using dayjs.unix(0) to set to Unix Epoch time
  },

  splitSlug(fullSlug: string): { slug: string | undefined; index: number | undefined } {
    try {
      const formattedValue = fullSlug.toLowerCase()
      const splitted = formattedValue.split('-')
      assert(splitted.length === 2, 'Invalid slug format')
      const [slug, sIndex] = formattedValue.split('-')
      const index = parseInt(sIndex, 10)
      assert(!isNaN(index), 'Invalid index format')
      return { slug, index }
    } catch (error) {
      return { slug: undefined, index: undefined }
    }
  },

  calculateDaysDifference(transactionTimestamp: number): number {
    const currentTimestamp = new Date().getTime()
    const timeDifferenceMs = currentTimestamp - transactionTimestamp
    return timeDifferenceMs / (1000 * 60 * 60 * 24)
  },

  hasPropsWithValuesExcludingNetwork(obj: any) {
    const filteredValues = Object.entries(obj)
      .filter(([key, _]) => key !== 'network')
      .map(([_, value]) => value)

    return filteredValues.some(value => value !== undefined)
  },

  parseBoolean: (value: any): boolean | undefined => {
    if (value === undefined || value === 'undefined') {
      return
    }
    return value === true || value === 'true'
  },

  parseNumber: (value: any): number | null | undefined => {
    if (value === undefined || value === 'undefined') {
      return
    }
    const parsedNumber = Number(value)
    return isNaN(parsedNumber) ? undefined : parsedNumber
  },

  isScientificNumber: (value: number) => {
    const scientificPattern = /^-?\d+(\.\d+)?e[-+]?\d+$/i
    return scientificPattern.test(value.toString())
  },

  isDecimalNumber: (value: number) => {
    const decimalPattern = /^\d+\.\d+$/
    return decimalPattern.test(value.toString())
  },

  mergeAndRemoveDuplicatePlugins: (installedPlugins: Plugin[] = [], settingPlugins: Plugin[] = []) => {
    const mergedArray = installedPlugins.concat(settingPlugins)

    // Use a Map to remove duplicates based on 'address'
    const uniqueArray = mergedArray.filter(
      (plugin: Plugin, index, self: Plugin[]) => index === self.findIndex(p => p.address === plugin.address),
    )

    return uniqueArray
  },

  filterArrayByProperty: (configArray: IIndexerConfig[], propertyName: string) => {
    return configArray.filter(eventConfig => eventConfig[propertyName])
  },

  getUniqueValuesByKey(arr: Array<any>, columnKey: string) {
    return [...new Set(arr.map(item => item[columnKey]))]
  },
}

export default Utils
