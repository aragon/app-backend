import Format from '@src/logger/format'
import { expect } from 'chai'
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
})
