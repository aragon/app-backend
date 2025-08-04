import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Utils from '@helpers/utils'
import utils from '@helpers/utils'
import logger from '@logger'
import dayjs from '@helpers/dayjs'
import { NetworksEnum } from '@types'

describe('Helpers:Utils', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('splitSlug', () => {
    it('should correctly split a valid slug with a numeric index', () => {
      const fullSlug = 'pluginType-123'
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: 'plugintype',
        index: 123,
      })
    })

    it('should handle slugs with a zero index', () => {
      const fullSlug = 'plugin-0'
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: 'plugin',
        index: 0,
      })
    })

    it('should throw an error if the slug does not contain a dash', () => {
      const fullSlug = 'invalidSlug'
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: undefined,
        index: undefined,
      })
    })

    it('should throw an error if the index is not numeric', () => {
      const fullSlug = 'pluginType-abc'
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: undefined,
        index: undefined,
      })
    })

    it('should throw an error if the slug is empty', () => {
      const fullSlug = ''
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: undefined,
        index: undefined,
      })
    })

    it('should throw an error if the slug has multiple dashes', () => {
      const fullSlug = 'pluginType-123-456'
      const result = Utils.splitSlug(fullSlug)

      expect(result).to.deep.equal({
        slug: undefined,
        index: undefined,
      })
    })
  })

  describe('extractAdditionalParams', () => {
    it('should return an empty object if no additional params are present', () => {
      const knownParams = { a: 1, b: 2 }
      const queryParams = { a: 1, b: 2 }
      const result = Utils.extractAdditionalParams(knownParams, queryParams)
      expect(result).to.deep.equal({})
    })

    it('should return additional params that are not in knownParams', () => {
      const knownParams = { a: 1, b: 2 }
      const queryParams = { a: 1, b: 2, c: 3, d: 4 }
      const result = Utils.extractAdditionalParams(knownParams, queryParams)
      expect(result).to.deep.equal({ c: 3, d: 4 })
    })

    it('should skip keys specified in skipKeys', () => {
      const knownParams = { a: 1, b: 2 }
      const queryParams = { a: 1, b: 2, c: 3, d: 4, e: 5 }
      const skipKeys = ['c', 'e']
      const result = Utils.extractAdditionalParams(knownParams, queryParams, skipKeys)
      expect(result).to.deep.equal({ d: 4 })
    })

    it('should handle empty knownParams and return all queryParams except skipped ones', () => {
      const knownParams = {}
      const queryParams = { a: 1, b: 2, c: 3, d: 4 }
      const skipKeys = ['b', 'd']
      const result = Utils.extractAdditionalParams(knownParams, queryParams, skipKeys)
      expect(result).to.deep.equal({ a: 1, c: 3 })
    })

    it('should handle empty queryParams and return an empty object', () => {
      const knownParams = { a: 1, b: 2 }
      const queryParams = {}
      const result = Utils.extractAdditionalParams(knownParams, queryParams)
      expect(result).to.deep.equal({})
    })

    it('should handle both empty knownParams and queryParams and return an empty object', () => {
      const knownParams = {}
      const queryParams = {}
      const result = Utils.extractAdditionalParams(knownParams, queryParams)
      expect(result).to.deep.equal({})
    })
  })

  it('Should noop', () => {
    expect(Utils.noop()).to.eq(0)
  })

  it('aragonNetworkMap', () => {
    const expectedMap = {
      'ethereum-mainnet': 'ETHEREUM_MAINNET',
      'ethereum-sepolia': 'ETHEREUM_SEPOLIA',
      'polygon-mainnet': 'POLYGON_MAINNET',
      'base-mainnet': 'BASE_MAINNET',
      'arbitrum-mainnet': 'ARBITRUM_MAINNET',
      'zksync-sepolia': 'ZKSYNC_SEPOLIA',
      'zksync-mainnet': 'ZKSYNC_MAINNET',
      'optimism-mainnet': 'OPTIMISM_MAINNET',
      'peaq-mainnet': 'PEAQ_MAINNET',
      'chiliz-mainnet': 'CHILIZ_MAINNET',
      'corn-mainnet': 'CORN_MAINNET',
    }

    Object.keys(NetworksEnum).forEach(key => {
      const enumValue = NetworksEnum[key]
      expect(Utils.aragonNetworkMap[enumValue]).to.equal(expectedMap[enumValue], `Mismatch for ${enumValue}`)
    })
  })

  it('Should lowercaseFirstLetter', () => {
    expect(Utils.lowercaseFirstLetter('Test')).to.eq('test')
    expect(Utils.lowercaseFirstLetter(undefined)).to.eq(undefined)
  })

  it('Should wait', done => {
    let end = false

    Utils.wait(500)
      .then(() => {
        end = true
        return true
      })
      .catch((error: any) => {
        console.error(error)
      })

    setTimeout(() => {
      if (end) {
        done('too early')
      }
    }, 300)
    setTimeout(() => {
      if (end) {
        done()
      } else {
        done('too late')
      }
    }, 600)
  })

  it('Should get default error', () => {
    Utils.defaultError(new Error('test-err'))
  })

  it('setImmediateAsync', async () => {
    let rs = false
    let th = false

    const error = new Error('er')
    const logerror = sandbox.stub(logger, 'error')

    const fnResolve = async () => {
      await Utils.wait(100)
      rs = true
    }
    const fnThrow = async () => {
      await Utils.wait(100)
      th = true
      throw error
    }

    Utils.setImmediateAsync(fnResolve)
    Utils.setImmediateAsync(fnThrow)

    expect(rs).to.be.false
    expect(th).to.be.false

    await Utils.wait(110)

    expect(rs).to.be.true
    expect(th).to.be.true

    const errorObj = logerror.args[0] as any
    expect(errorObj[0]).to.eq(error.message)
    expect(errorObj[1].error).to.eq(error)
  })

  it('configParser', () => {
    const configSource = {
      string: 'coucou',
      array: 'coucou,caca',
      boolt: 'true',
      boolf: 'false',
      boolu: 'f',
      integer: 12,
      decimal: 12.12,
    }
    expect(Utils.configParser(configSource, 'string', 'string')).to.eq('coucou')
    expect(Utils.configParser(configSource, 'string', 'string', 'def')).to.eq('coucou')
    expect(Utils.configParser(configSource, 'string', 'array')).to.eq('coucou,caca')
    expect(Utils.configParser(configSource, 'string', 'unknown')).to.eq('')
    expect(Utils.configParser(configSource, 'string', 'unknown', 'def')).to.eq('def')

    expect(Utils.configParser(configSource, 'array', 'array')).to.deep.eq(['coucou', 'caca'])
    expect(Utils.configParser(configSource, 'array', 'array', ['def'])).to.deep.eq(['coucou', 'caca'])
    expect(Utils.configParser(configSource, 'array', 'string')).to.deep.eq(['coucou'])
    expect(Utils.configParser(configSource, 'array', 'unknown')).to.deep.eq([])
    expect(Utils.configParser(configSource, 'array', 'unknown', ['def'])).to.deep.eq(['def'])

    expect(Utils.configParser(configSource, 'bool', 'boolt')).to.be.true
    expect(Utils.configParser(configSource, 'bool', 'boolt', false)).to.be.true
    expect(Utils.configParser(configSource, 'bool', 'boolf')).to.be.false
    expect(Utils.configParser(configSource, 'bool', 'boolu')).to.be.false
    expect(Utils.configParser(configSource, 'bool', 'boolunnn')).to.be.false
    expect(Utils.configParser(configSource, 'bool', 'boolunnn', true)).to.be.true

    expect(Utils.configParser(configSource, 'number', 'integer')).to.eq(12)
    expect(Utils.configParser(configSource, 'number', 'decimal')).to.eq(12.12)
    expect(Utils.configParser(configSource, 'number', 'unkn')).to.eq(0)
    expect(Utils.configParser(configSource, 'number', 'unkn', 2)).to.eq(2)
  })

  it('configParser should throw error on unknown type', () => {
    const configSource = {
      test: 'value',
    }
    const key = 'test'

    expect(() => Utils.configParser(configSource, 'unknownType' as any, key)).to.throw('Unknown variable type')
  })

  it('Should parse json circular', () => {
    const child: any = {}
    const obj = { a: 1, child, b: 22n }
    child.obj = obj
    expect(Utils.JSONStringifyCircular(obj)).to.be.eq('{\n  "a": 1,\n  "child": {},\n  "b": "22"\n}')
  })

  it('enum to object', () => {
    enum en {
      a = 'a',
      b = 'b',
      c = 'c',
    }

    const obj = Utils.enumToObject(en)

    expect(Object.keys(obj).length).to.eq(3)
    expect(obj['a']).to.eq('a')
    expect(obj['b']).to.eq('b')
    expect(obj['c']).to.eq('c')
  })

  it('asyncForEach', async () => {
    let i = 0
    let done = false
    const arr = [0, 1, 2, 3]

    async function fn(obj: any, index: number, array: any) {
      expect(obj).to.eq(i)
      expect(index).to.eq(i)
      expect(array).to.eq(arr)
      i++
      if (i === 3) done = true
    }

    await Utils.asyncForEach(arr, fn)

    expect(done).to.be.true
  })

  it('Should asyncForEach and break on false', async () => {
    const stubFn = sandbox.stub().callsFake(async (_item: any, i: number) => i !== 1)
    await Utils.asyncForEach([0, 1, 2, 3], stubFn, true)
    expect(stubFn.callCount).to.be.eq(2)
  })

  describe('setIntervalAsync', () => {
    it('repeats', async () => {
      const clock = sandbox.useFakeTimers()
      const onError = sandbox.stub()
      const fn = sandbox.stub().resolves()
      const delay = 200

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
        onError,
      })

      // Function executes immediately
      await clock.tickAsync(0)
      expect(fn.args.length).to.eq(1)

      // Then after delay
      await clock.tickAsync(200)
      expect(fn.args.length).to.eq(2)

      // Then after another delay
      await clock.tickAsync(200)
      expect(fn.args.length).to.eq(3)

      clear()

      // Should not execute after clear
      await clock.tickAsync(200)
      expect(fn.args.length).to.eq(3)
    })

    it('stops while working', async () => {
      const clock = sandbox.useFakeTimers()
      const onError = sandbox.stub()
      const fn = sandbox.stub().resolves()
      const delay = 100

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
        onError,
      })

      // Function executes immediately
      await clock.tickAsync(0)
      expect(fn.args.length).to.eq(1)

      clear()

      // Should not execute after clear
      await clock.tickAsync(600)
      expect(fn.args.length).to.eq(1)
    })

    it('clear waits execution end', async () => {
      const clock = sandbox.useFakeTimers()
      const onError = sandbox.stub()
      let resolveExecutions: (() => void)[] = []
      const fn = sandbox.stub().callsFake(() => {
        return new Promise(resolve => {
          resolveExecutions.push(resolve as any)
        })
      })
      const delay = 100

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
        onError,
      })

      await clock.tickAsync(10)
      expect(fn.args.length).to.eq(1)

      // Start clearing but don't resolve the execution yet
      const clearPromise = clear(true)

      // Advance time to show clear is waiting
      await clock.tickAsync(100)

      // Now resolve the execution to complete the clear
      resolveExecutions[0]()

      await clearPromise

      // Verify clear waited for execution to complete
      expect(fn.args.length).to.eq(1)
    })

    it('throws', async () => {
      const clock = sandbox.useFakeTimers()
      const onError = sandbox.stub()
      const e = new Error('pascontent')
      const fn = sandbox.stub().resolves()
      const delay = 500

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
        onError,
      })

      await clock.tickAsync(200)
      expect(fn.args.length).to.eq(1)

      fn.rejects(e)
      expect(onError.calledOnce).to.be.false

      await clock.tickAsync(500)

      expect(fn.args.length).to.eq(2)
      expect(onError.calledOnce).to.be.true
      expect(onError.args[0][0]).to.eq(e)

      clear()
    })

    it('throws but still continues', async () => {
      const clock = sandbox.useFakeTimers()
      const onError = sandbox.stub()
      const e = new Error('pascontent')
      const fn = sandbox.stub().resolves()
      const delay = 400

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
        onError,
      })

      // First execution is immediate
      await clock.tickAsync(0)
      expect(fn.args.length).to.eq(1)

      // Change fn to reject for next execution
      fn.rejects(e)
      expect(onError.calledOnce).to.be.false

      // Execute after delay - this will throw
      await clock.tickAsync(400)
      expect(fn.args.length).to.eq(2)
      expect(onError.calledOnce).to.be.true
      expect(onError.args[0][0]).to.eq(e)

      // Should still continue after error
      await clock.tickAsync(400)
      expect(fn.args.length).to.eq(3)

      clear()
    })

    it('throws with default error handler', async () => {
      const clock = sandbox.useFakeTimers()
      const error = sandbox.stub(logger, 'error')

      const e = new Error('pascontent')
      const fn = sandbox.stub().resolves()
      const delay = 500

      const clear = Utils.setIntervalAsync({
        fn,
        delay,
      })

      await clock.tickAsync(200)
      expect(fn.args.length).to.eq(1)

      fn.rejects(e)
      expect(error.calledOnce).to.be.false

      await clock.tickAsync(500)

      clear()

      expect(fn.args.length).to.eq(2)
      expect(error.calledOnce).to.be.true

      const errorObj = error.args[0] as any
      expect(errorObj[0]).to.eq('pascontent')
      expect(errorObj[1].error).to.eq(e)
    })
  })

  it('asyncMap', async () => {
    const array = [100, 200, 20001, 20002]

    async function fn(time: number) {
      if (time > 2000) throw new Error(time.toString())
      await Utils.wait(200)
      return time
    }

    const onError = sandbox.stub()
    const t1 = Date.now()

    const res = await Utils.asyncMap(array, fn, onError)

    const time = Date.now() - t1

    expect(time > 100).to.be.true

    expect(res[0]).to.eq(100)
    expect(res[1]).to.eq(200)
    expect(onError.args[0][0].message).to.eq('20001')
    expect(onError.args[1][0].message).to.eq('20002')
  })

  it('asyncMap should throw error missing param', async () => {
    const array = [100, 200]

    async function fn(time: number) {
      await Utils.wait(100)
      return time
    }

    try {
      await Utils.asyncMap(array, fn)
    } catch (e: any) {
      expect(e.message).to.be.eq('missing parameters')
    }
  })

  it('asyncParralel', async () => {
    const tasks = [
      async () => {
        await Utils.wait(100)
        return 1
      },
      async () => {
        await Utils.wait(100)
        return 2
      },
      async () => {
        await Utils.wait(100)
        throw new Error('1')
      },
      async () => {
        await Utils.wait(100)
        throw new Error('2')
      },
    ]

    const onError = sandbox.stub()
    const t1 = Date.now()

    const res = await Utils.asyncParallel(tasks, onError)

    const time = Date.now() - t1

    expect(time >= 100).to.be.true

    expect(res[0]).to.eq(1)
    expect(res[1]).to.eq(2)
    expect(onError.args[0][0].message).to.eq('1')
    expect(onError.args[1][0].message).to.eq('2')
  })

  it('generateRandomName', async () => {
    const length = 10

    const result = Utils.generateRandomName(length)

    expect(result.length).to.eq(length)
  })

  describe('parsePermissions', () => {
    it('should correctly parse and convert permissions array', () => {
      const permissionsInput = [
        { toObject: () => ({ id: '1', operation: '2' }) },
        { toObject: () => ({ id: '2', operation: '3' }) },
      ]

      const expectedResult = [
        { id: '1', operation: 2 },
        { id: '2', operation: 3 },
      ]

      const result = Utils.parsePermissions(permissionsInput)

      expect(result).to.deep.equal(expectedResult)
    })

    it('should handle permissions with various data types for operation', () => {
      // Testing different data types for operation
      const permissionsInput = [
        { toObject: () => ({ id: '1', operation: '10' }) },
        { toObject: () => ({ id: '2', operation: 20 }) }, // Already a number
        { toObject: () => ({ id: '3', operation: '0x14' }) }, // Hexadecimal string
      ]

      const expectedResult = [
        { id: '1', operation: 10 },
        { id: '2', operation: 20 },
        { id: '3', operation: 20 }, // Expecting conversion from hex to decimal
      ]

      const result = Utils.parsePermissions(permissionsInput)

      expect(result).to.deep.equal(expectedResult)
    })

    it('should return an empty array when no permissions are provided', () => {
      const permissionsInput = []

      const result = Utils.parsePermissions(permissionsInput)

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle null or undefined inputs gracefully', () => {
      const permissionsInput = null

      const result = Utils.parsePermissions(permissionsInput)

      expect(result).to.be.an('array').that.is.empty
    })

    it('should return default if permission does not have toObject method', () => {
      const permissionsInput = [{ id: '1', operation: '2' }]

      const result = Utils.parsePermissions(permissionsInput)
      expect(result[0].id).to.eq(permissionsInput[0].id)
      expect(result[0].operation).to.eq(permissionsInput[0].operation)
    })
  })

  describe('hasHoursPassed', () => {
    it('should return true if the specified hours have passed', () => {
      const pastDate = dayjs().subtract(25, 'hour').toDate()
      expect(utils.hasHoursPassed(pastDate, 24)).to.be.true
    })

    it('should return false if the specified hours have not passed', () => {
      const pastDate = dayjs().subtract(23, 'hour').toDate()
      expect(utils.hasHoursPassed(pastDate, 24)).to.be.false
    })
  })

  describe('calculatePercentageChange', () => {
    it('should calculate the correct positive percentage change', () => {
      expect(utils.calculatePercentageChange(200, 100)).to.equal(100.0)
    })

    it('should calculate the correct negative percentage change', () => {
      expect(utils.calculatePercentageChange(50, 100)).to.equal(-50.0)
    })

    it('should handle division by zero when old value is zero', () => {
      expect(utils.calculatePercentageChange(100, 0)).to.eq(Infinity)
    })
  })

  describe('getEpochDayjs', () => {
    it('should return a Dayjs object set to the Unix Epoch', () => {
      const epoch = utils.getEpochDayjs()
      expect(epoch.isValid()).to.be.true
      expect(epoch.unix()).to.equal(0)
    })
  })

  describe('arrayChunk', () => {
    it('should chunkArray', () => {
      const array = [1, 2, 3, 4, 5, 6]
      const size = 2
      const result = Utils.chunkArray(array, size)
      expect(result).to.deep.eq([
        [1, 2],
        [3, 4],
        [5, 6],
      ])
    })

    it('should return empty array if array is empty', () => {
      const array = []
      const size = 2
      const result = Utils.chunkArray(array, size)
      expect(result).to.deep.eq([[]])
    })
  })

  it('hasPropsWithValuesExcludingNetwork', () => {
    expect(Utils.hasPropsWithValuesExcludingNetwork({ test: undefined, network: 'test' })).to.be.false
    expect(Utils.hasPropsWithValuesExcludingNetwork({ test: 'test', network: undefined })).to.be.true
  })

  it('parseBoolean', () => {
    expect(Utils.parseBoolean(undefined)).to.be.undefined
    expect(Utils.parseBoolean(true)).to.be.true
    expect(Utils.parseBoolean('true')).to.be.true
    expect(Utils.parseBoolean('false')).to.be.false
    expect(Utils.parseBoolean(false)).to.be.false
  })

  describe('setImmediateAsyncArray', () => {
    it('should execute all functions in the array', async () => {
      const fn1 = sandbox.stub().resolves(1)
      const fn2 = sandbox.stub().resolves(2)
      const onError = sandbox.stub()

      await new Promise(resolve => {
        Utils.setImmediateAsyncArray([fn1, fn2], onError)
        setImmediate(resolve)
      })

      sinon.assert.calledOnce(fn1)
      sinon.assert.calledOnce(fn2)
      sinon.assert.notCalled(onError)
    })

    it('should call onError if an error occurs in any function', async () => {
      const error = new Error('Test Error')
      const fn1 = sandbox.stub().resolves(1)
      const fn2 = sandbox.stub().rejects(error)
      const onError = sandbox.stub()

      await new Promise(resolve => {
        Utils.setImmediateAsyncArray([fn1, fn2], onError)
        setImmediate(resolve)
      })

      sinon.assert.calledOnce(fn1)
      sinon.assert.calledOnce(fn2)
      sinon.assert.calledOnceWithExactly(onError, sinon.match(error))
    })

    it('should continue to execute all functions even if one fails', async () => {
      const error = new Error('Test Error')
      const fn1 = sandbox.stub().rejects(error)
      const fn2 = sandbox.stub().resolves(2)
      const onError = sandbox.stub()

      await new Promise(resolve => {
        Utils.setImmediateAsyncArray([fn1, fn2], onError)
        setImmediate(resolve)
      })

      sinon.assert.calledOnce(fn1)
      sinon.assert.calledOnce(fn2)
      sinon.assert.calledOnce(onError)
    })
  })

  describe('calculateDaysDifference', () => {
    it('should return approximately 0 days when the timestamp is for the current day', () => {
      const timestampToday = new Date().getTime()
      const result = Utils.calculateDaysDifference(timestampToday)
      expect(result).to.be.closeTo(0, 0.1)
    })

    it('should return approximately 1 day when the timestamp is from 1 day ago', () => {
      const oneDayInMs = 24 * 60 * 60 * 1000
      const timestampOneDayAgo = new Date().getTime() - oneDayInMs
      const result = Utils.calculateDaysDifference(timestampOneDayAgo)
      expect(result).to.be.closeTo(1, 0.1)
    })

    it('should return approximately -1 day when the timestamp is 1 day in the future', () => {
      const oneDayInMs = 24 * 60 * 60 * 1000
      const timestampOneDayFuture = new Date().getTime() + oneDayInMs
      const result = Utils.calculateDaysDifference(timestampOneDayFuture)
      expect(result).to.be.closeTo(-1, 0.1)
    })

    it('should handle large time differences accurately', () => {
      const oneHundredDaysInMs = 100 * 24 * 60 * 60 * 1000
      const timestampOneHundredDaysAgo = new Date().getTime() - oneHundredDaysInMs
      const result = Utils.calculateDaysDifference(timestampOneHundredDaysAgo)
      expect(result).to.be.closeTo(100, 0.1)
    })
  })

  it('validateString', () => {
    expect(Utils.validateString('test')).to.eq('test')
    expect(Utils.validateString('')).to.be.null
  })

  it('isScientificNumber', () => {
    expect(Utils.isScientificNumber('7.326e+22')).to.true
    expect(Utils.isScientificNumber(7.326e22)).to.be.true
    expect(Utils.isScientificNumber(10.314234324324)).to.be.false
    expect(Utils.isScientificNumber(1032423423)).to.be.false
  })

  it('isDecimalNumber', () => {
    expect(Utils.isDecimalNumber(10.1)).to.true
    expect(Utils.isDecimalNumber(7.326e22)).to.be.false
    expect(Utils.isDecimalNumber(10)).to.be.false
    expect(Utils.isDecimalNumber(1032423423)).to.be.false
  })

  it('getUniqueValuesByKey', () => {
    const array = [{ a: 1 }, { a: 2 }, { a: 1 }, { a: 3 }, { a: 2 }]
    const result = Utils.getUniqueValuesByKey(array, 'a')
    expect(result).to.deep.eq([1, 2, 3])
  })

  describe('parseNumber', () => {
    it('should return undefined when input is undefined', () => {
      const result = Utils.parseNumber(undefined)
      expect(result).to.be.undefined
    })

    it('should return undefined when input is "undefined" as a string', () => {
      const result = Utils.parseNumber('undefined')
      expect(result).to.be.undefined
    })

    it('should return a number when input is a valid numeric string', () => {
      const result = Utils.parseNumber('42')
      expect(result).to.be.a('number').that.equals(42)
    })

    it('should return a number when input is an actual number', () => {
      const result = Utils.parseNumber(123)
      expect(result).to.be.a('number').that.equals(123)
    })

    it('should return NaN when input is a non-numeric string', () => {
      const result = Utils.parseNumber('hello')
      expect(result).to.be.undefined
    })

    it('should return NaN when input is an object', () => {
      const result = Utils.parseNumber({ key: 'value' })
      expect(result).to.be.undefined
    })

    it('should return NaN when input is an array', () => {
      const result = Utils.parseNumber([1, 2, 3])
      expect(result).to.be.undefined
    })

    it('should return 0 when input is "0" as a string', () => {
      const result = Utils.parseNumber('0')
      expect(result).to.be.a('number').that.equals(0)
    })

    it('should return a negative number when input is a negative numeric string', () => {
      const result = Utils.parseNumber('-42')
      expect(result).to.be.a('number').that.equals(-42)
    })
  })

  describe('mergeAndRemoveDuplicatePlugins', () => {
    it('should return an empty array when both inputs are empty', () => {
      const result = Utils.mergeAndRemoveDuplicatePlugins([], [])
      expect(result).to.be.an('array').that.is.empty
    })

    it('should return the same array when no duplicates exist', () => {
      const installedPlugins = [
        { address: '0xPlugin1', name: 'Plugin A' } as any,
        { address: '0xPlugin2', name: 'Plugin B' } as any,
      ]
      const settingPlugins = [
        { address: '0xPlugin3', name: 'Plugin C' } as any,
        { address: '0xPlugin4', name: 'Plugin D' } as any,
      ]

      const result = Utils.mergeAndRemoveDuplicatePlugins(installedPlugins, settingPlugins)

      expect(result).to.have.length(4)
      expect(result).to.deep.include.members(installedPlugins)
      expect(result).to.deep.include.members(settingPlugins)
    })

    it('should remove duplicate plugins based on address', () => {
      const installedPlugins = [
        { address: '0xPlugin1', name: 'Plugin A' } as any,
        { address: '0xPlugin2', name: 'Plugin B' } as any,
      ]
      const settingPlugins = [
        { address: '0xPlugin2', name: 'Plugin B' } as any, // Duplicate
        { address: '0xPlugin3', name: 'Plugin C' } as any,
      ]

      const result = Utils.mergeAndRemoveDuplicatePlugins(installedPlugins, settingPlugins)

      expect(result).to.have.length(3)
      expect(result).to.deep.include({ address: '0xPlugin1', name: 'Plugin A' })
      expect(result).to.deep.include({ address: '0xPlugin2', name: 'Plugin B' }) // Exists once
      expect(result).to.deep.include({ address: '0xPlugin3', name: 'Plugin C' })
    })

    it('should handle cases where all plugins are duplicates', () => {
      const installedPlugins = [
        { address: '0xPlugin1', name: 'Plugin A' } as any,
        { address: '0xPlugin2', name: 'Plugin B' } as any,
      ]
      const settingPlugins = [
        { address: '0xPlugin1', name: 'Plugin A' } as any, // Duplicate
        { address: '0xPlugin2', name: 'Plugin B' } as any, // Duplicate
      ]

      const result = Utils.mergeAndRemoveDuplicatePlugins(installedPlugins, settingPlugins)

      expect(result).to.have.length(2)
      expect(result).to.deep.include({ address: '0xPlugin1', name: 'Plugin A' })
      expect(result).to.deep.include({ address: '0xPlugin2', name: 'Plugin B' })
    })

    it('should handle one list being empty', () => {
      const installedPlugins = [{ address: '0xPlugin1', name: 'Plugin A' } as any]
      const settingPlugins: any[] = [] // Empty

      const result = Utils.mergeAndRemoveDuplicatePlugins(installedPlugins, settingPlugins)

      expect(result).to.have.length(1)
      expect(result).to.deep.include({ address: '0xPlugin1', name: 'Plugin A' })
    })
  })

  describe('deepConvertToObject', () => {
    it('should return primitive values as-is', () => {
      expect(Utils.deepConvertToObject(123)).to.equal(123)
      expect(Utils.deepConvertToObject('test')).to.equal('test')
      expect(Utils.deepConvertToObject(true)).to.equal(true)
      expect(Utils.deepConvertToObject(null)).to.be.null
      expect(Utils.deepConvertToObject(undefined)).to.be.undefined
    })

    it('should convert plain objects to plain objects', () => {
      const obj = { a: 1, b: 'test', c: true }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal(obj)
    })

    it('should convert objects with toObject method', () => {
      const obj = {
        toObject: () => ({ a: 1, b: 'test' }),
        c: 'should not be included',
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal({ a: 1, b: 'test' })
    })

    it('should convert objects with toArray method', () => {
      const obj = {
        toArray: () => [1, 2, 3],
        items: 'should not be included',
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal([1, 2, 3])
    })

    it('should handle nested objects recursively', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3,
          },
        },
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal(obj)
    })

    it('should handle arrays recursively', () => {
      const obj = {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal(obj)
    })

    it('should skip function properties and properties starting with underscore', () => {
      const obj = {
        a: 1,
        _private: 'private',
        func: () => 'function',
        b: 2,
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal({ a: 1, b: 2 })
    })

    it('should handle complex nested structures', () => {
      const nestedObj = {
        toObject: () => ({
          items: [
            { id: 1, toObject: () => ({ name: 'Item 1' }) },
            { id: 2, toObject: () => ({ name: 'Item 2' }) },
          ],
        }),
      }
      const result = Utils.deepConvertToObject(nestedObj)
      expect(result).to.deep.equal({
        items: [{ name: 'Item 1' }, { name: 'Item 2' }],
      })
    })

    it('should gracefully handle circular references', () => {
      const circular: any = { a: 1 }
      circular.self = circular
      circular.b = { parent: circular }

      const result = Utils.deepConvertToObject(circular)
      expect(result).to.have.property('a', 1)
      expect(result).to.have.property('self')
      expect(result).to.have.property('b')
      expect(result.b).to.have.property('parent')
    })

    it('should handle failed toObject/toArray calls', () => {
      const obj = {
        toObject: () => {
          throw new Error('Failed conversion')
        },
        a: 1,
        b: 2,
      }
      const result = Utils.deepConvertToObject(obj)
      expect(result).to.deep.equal({ a: 1, b: 2 })
    })
  })

  describe('fallbackCall', () => {
    it('should return result from first provider on success', async () => {
      const providers = ['provider1', 'provider2', 'provider3']
      const expectedResult = { data: 'success' }

      const fn = sandbox.stub()
      fn.withArgs('provider1').resolves(expectedResult)
      fn.withArgs('provider2').resolves({ data: 'backup' })

      const result = await Utils.fallbackCall(providers, fn)

      expect(result).to.deep.equal(expectedResult)
      expect(fn.calledOnce).to.be.true
      expect(fn.calledWith('provider1')).to.be.true
    })

    it('should fallback to second provider when first fails', async () => {
      const providers = ['provider1', 'provider2', 'provider3']
      const expectedResult = { data: 'backup' }
      const error = new Error('Provider1 failed')

      const fn = sandbox.stub()
      fn.withArgs('provider1').rejects(error)
      fn.withArgs('provider2').resolves(expectedResult)

      const onError = sandbox.stub()

      const result = await Utils.fallbackCall(providers, fn, { onError })

      expect(result).to.deep.equal(expectedResult)
      expect(fn.calledTwice).to.be.true
      expect(onError.calledOnceWith(error, 'provider1', 0)).to.be.true
    })

    it('should return null when all providers fail', async () => {
      const providers = ['provider1', 'provider2']
      const error1 = new Error('Provider1 failed')
      const error2 = new Error('Provider2 failed')

      const fn = sandbox.stub()
      fn.withArgs('provider1').rejects(error1)
      fn.withArgs('provider2').rejects(error2)

      const onError = sandbox.stub()

      const result = await Utils.fallbackCall(providers, fn, { onError })

      expect(result).to.be.null
      expect(fn.calledTwice).to.be.true
      expect(onError.calledTwice).to.be.true
      expect(onError.firstCall.calledWith(error1, 'provider1', 0)).to.be.true
      expect(onError.secondCall.calledWith(error2, 'provider2', 1)).to.be.true
    })

    it('should skip providers that return invalid results based on validation', async () => {
      const providers = ['provider1', 'provider2', 'provider3']
      const invalidResult = null
      const validResult = { data: 'valid' }

      const fn = sandbox.stub()
      fn.withArgs('provider1').resolves(invalidResult)
      fn.withArgs('provider2').resolves(validResult)

      const validate = sandbox.stub()
      validate.withArgs(invalidResult).returns(false)
      validate.withArgs(validResult).returns(true)

      const result = await Utils.fallbackCall(providers, fn, { validate })

      expect(result).to.deep.equal(validResult)
      expect(fn.calledTwice).to.be.true
      expect(validate.calledTwice).to.be.true
    })

    it('should handle timeout correctly', async () => {
      const providers = ['provider1', 'provider2']

      const fn = sandbox.stub()
      fn.withArgs('provider1').returns(new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 2000)))
      fn.withArgs('provider2').resolves({ data: 'fast' })

      const onError = sandbox.stub()

      const result = await Utils.fallbackCall(providers, fn, {
        timeout: 100,
        onError,
      })

      expect(result).to.deep.equal({ data: 'fast' })
      expect(fn.calledTwice).to.be.true
      expect(onError.calledOnce).to.be.true
      expect(onError.firstCall.args[0]?.message).to.equal('Timeout')
    })

    it('should call onError with correct parameters', async () => {
      const providers = ['prov1', 'prov2']
      const error1 = new Error('Error 1')
      const error2 = new Error('Error 2')

      const fn = sandbox.stub()
      fn.withArgs('prov1').rejects(error1)
      fn.withArgs('prov2').rejects(error2)

      const onError = sandbox.stub()

      await Utils.fallbackCall(providers, fn, { onError })

      expect(onError.calledTwice).to.be.true
      expect(onError.firstCall.calledWith(error1, 'prov1', 0)).to.be.true
      expect(onError.secondCall.calledWith(error2, 'prov2', 1)).to.be.true
    })

    it('should handle validation function that throws', async () => {
      const providers = ['provider1', 'provider2']
      const result1 = { data: 'test' }
      const result2 = { data: 'backup' }

      const fn = sandbox.stub()
      fn.withArgs('provider1').resolves(result1)
      fn.withArgs('provider2').resolves(result2)

      const validate = sandbox.stub()
      validate.withArgs(result1).throws(new Error('Validation error'))
      validate.withArgs(result2).returns(true)

      const onError = sandbox.stub()

      const result = await Utils.fallbackCall(providers, fn, { validate, onError })

      expect(result).to.deep.equal(result2)
      expect(onError.calledOnce).to.be.true
      expect(onError.firstCall.args[0]?.message).to.equal('Validation error')
    })
  })
})
