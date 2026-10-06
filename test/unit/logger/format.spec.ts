import config from '@config'
import Format from '@src/logger/format'
import { expect } from 'chai'
import * as os from 'os'
import * as process from 'process'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Logger: Format', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('formatRecursiveError', () => {
    it('Should format simple error', () => {
      const info = {
        error: new Error('fake-error'),
      }

      expect(Format.formatRecursiveError(info)).to.be.deep.eq({
        error: info.error,
        errorCode: undefined,
        errorMessage: 'fake-error',
        errorStack: info.error.stack,
      })
    })

    it('Should format error recursive 1', () => {
      const info: any = {
        error: new Error('fake-error'),
      }
      info.error.error = new Error('fake-error1')

      expect(Format.formatRecursiveError(info)).to.be.deep.eq({
        error: info.error,
        errorStack: info.error.stack,
        errorCode: undefined,
        errorMessage: 'fake-error',
        errorDeep: {
          error: info.error.error,
          errorStack: info.error.error.stack,
          errorCode: undefined,
          errorMessage: 'fake-error1',
        },
      })
    })

    it('Should format error recursive 2', () => {
      const info: any = {
        error: new Error('fake-error'),
      }
      info.error.error = new Error('fake-error1')
      info.error.error.error = new Error('fake-error2')

      expect(Format.formatRecursiveError(info)).to.be.deep.eq({
        error: info.error,
        errorStack: info.error.stack,
        errorCode: undefined,
        errorMessage: 'fake-error',
        errorDeep: {
          error: info.error.error,
          errorStack: info.error.error.stack,
          errorCode: undefined,
          errorMessage: 'fake-error1',
          errorDeep: {
            error: info.error.error.error,
            errorStack: info.error.error.error.stack,
            errorCode: undefined,
            errorMessage: 'fake-error2',
          },
        },
      })
    })
  })

  describe('formatMeta', () => {
    it('should format Meta without any extra', () => {
      const info = {
        level: 'info',
        message: 'message1',
        machine: 'machine1',
        splat: 1,
      }

      expect(Format.formatMeta(info)).to.be.deep.eq({
        level: 'info',
        machine: 'machine1',
        message: 'message1',
      })
    })

    it('should format Meta without with meta', () => {
      const info = {
        level: 'info',
        message: 'message1',
        machine: 'machine1',
        splat: 1,
        t1: 't11',
        t2: 't22',
        t3: 3,
      }

      expect(Format.formatMeta(info)).to.be.deep.eq({
        level: 'info',
        machine: 'machine1',
        message: 'message1',
        meta: {
          t1: 't11',
          t2: 't22',
          t3: 3,
        },
      })
    })

    it('should format Meta without with meta and error', () => {
      const info = {
        level: 'error',
        message: 'message1',
        machine: 'machine1',
        splat: 1,
        t1: 't11',
        t2: 't22',
        t3: 3,
        error: new Error('fake-error'),
      }

      expect(Format.formatMeta(info)).to.be.deep.eq({
        level: 'error',
        machine: 'machine1',
        message: 'message1',
        meta: {
          error: info.error,
          t1: 't11',
          t2: 't22',
          t3: 3,
        },
        error: {
          error: info.error,
          errorCode: undefined,
          errorMessage: 'fake-error',
          errorStack: info.error.stack,
          level: 'error',
          machine: 'machine1',
          message: 'message1',
          splat: 1,
          t1: 't11',
          t2: 't22',
          t3: 3,
        },
      })
    })
  })

  describe('formatMachine', () => {
    it('should attach machine, environment and tags to the info', () => {
      const info: any = Format.formatMachine().transform({ level: 'info', message: 'm' })

      expect(info.machine.hostname).to.eq(os.hostname())
      expect(info.machine.platform).to.eq(process.platform)
      expect(info.machine.pid).to.eq(process.pid)
      expect(info.environment).to.eq(config.ENVIRONMENT)
      expect(info.tags).to.deep.eq([config.LOG.LOGZIO_SERVER_NAME])
    })
  })

  describe('formatError', () => {
    it('should attach error message and stack from the error', () => {
      const error = new Error('fake-error')

      const info: any = Format.formatError().transform({ level: 'error', message: 'm', error })

      expect(info.errorMessage).to.eq('fake-error')
      expect(info.errorStack).to.eq(error.stack)
      expect(info.errorCode).to.be.undefined
    })
  })

  describe('consoleFormat', () => {
    it('should build the console message with a detail block when showDetails is on', () => {
      const info: any = Format.consoleFormat({ showDetails: true }).transform(
        {
          level: 'info',
          message: 'm',
          timestamp: 't',
          a: 1,
        },
        { showDetails: true },
      )

      expect(info[Symbol.for('message')]).to.eq('t [info] m\nDetail : {\n  "a": 1\n}')
    })

    it('should build the console message without a detail block when showDetails is off', () => {
      const info: any = Format.consoleFormat({ showDetails: false }).transform(
        {
          level: 'info',
          message: 'm',
          timestamp: 't',
          a: 1,
        },
        { showDetails: false },
      )

      expect(info[Symbol.for('message')]).to.eq('t [info] m')
    })
  })
})
