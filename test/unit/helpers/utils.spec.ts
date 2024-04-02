import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Utils from '@helpers/utils'
import logger from '@logger'

describe('Helpers:Utils', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should noop', () => {
    expect(Utils.noop()).to.eq(0)
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
    const obj = { a: 1, child }
    child.obj = obj
    expect(Utils.JSONStringifyCircular(obj)).to.be.eq('{\n  "a": 1,\n  "child": {}\n}')
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
      const onError = sinon.stub()
      const fn = sinon.stub().resolves(Utils.wait(50))
      const delay = 200

      const clear = Utils.setIntervalAsync(fn, delay, onError)

      await Utils.wait(100)
      expect(fn.args.length).to.eq(1)

      await Utils.wait(200)
      expect(fn.args.length).to.eq(2)

      await Utils.wait(300)
      expect(fn.args.length).to.eq(3)

      clear()

      await Utils.wait(300)
      expect(fn.args.length).to.eq(3)
    })

    it('stops while working', async () => {
      const onError = sinon.stub()
      const fn = sinon.stub().resolves(Utils.wait(500))
      const delay = 100

      const clear = Utils.setIntervalAsync(fn, delay, onError)

      await Utils.wait(100)
      expect(fn.args.length).to.eq(1)

      clear()

      await Utils.wait(600)
      expect(fn.args.length).to.eq(1)
    })

    it('clear waits execution end', async () => {
      const onError = sinon.stub()
      const fn = sinon.stub().resolves(Utils.wait(500))
      const delay = 100

      const clear = Utils.setIntervalAsync(fn, delay, onError)
      await Utils.wait(10)
      expect(fn.args.length).to.eq(1)

      const d = Date.now()

      await clear(true)

      expect(Date.now() - d).to.be.greaterThan(400)
    })

    it('throws', async () => {
      const onError = sinon.stub()
      const e = new Error('pascontent')
      const fn = sinon.stub().resolves(Utils.wait(100))
      const delay = 500

      const clear = Utils.setIntervalAsync(fn, delay, onError)

      await Utils.wait(200)
      expect(fn.args.length).to.eq(1)

      fn.rejects(e)
      expect(onError.calledOnce).to.be.false

      await Utils.wait(500)

      expect(fn.args.length).to.eq(2)
      expect(onError.calledOnce).to.be.true
      expect(onError.args[0][0]).to.eq(e)

      clear()
    })

    it('throws but still continues', async () => {
      const onError = sinon.stub()
      const e = new Error('pascontent')
      const fn = sinon.stub().resolves(Utils.wait(50))
      const delay = 400

      const clear = Utils.setIntervalAsync(fn, delay, onError)

      await Utils.wait(200)
      expect(fn.args.length).to.eq(1)

      fn.rejects(e)
      expect(onError.calledOnce).to.be.false

      await Utils.wait(500)

      expect(fn.args.length).to.eq(2)
      expect(onError.calledOnce).to.be.true
      expect(onError.args[0][0]).to.eq(e)

      await Utils.wait(500)
      expect(fn.args.length).to.eq(3)

      clear()
    })

    it('throws with default error handler', async () => {
      const error = sandbox.stub(logger, 'error')

      const e = new Error('pascontent')
      const fn = sinon.stub().resolves(Utils.wait(100))
      const delay = 500

      const clear = Utils.setIntervalAsync(fn, delay)

      await Utils.wait(200)
      expect(fn.args.length).to.eq(1)

      fn.rejects(e)
      expect(error.calledOnce).to.be.false

      await Utils.wait(500)

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

  it('getDaoPermalink', async () => {
    expect(
      Utils.getDaoPermalink({
        network: 'fake-network',
        daoAddress: 'fake-address',
        ens: 'fake-ens',
      } as any),
    ).to.eq(`fake-network-fake-ens`)

    expect(
      Utils.getDaoPermalink({
        network: 'fake-network',
        daoAddress: 'fake-address',
        ens: null,
      } as any),
    ).to.eq(`fake-network-fake-address`)
  })
})
