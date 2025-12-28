import * as Errors from '@errors'
import { ErrorKeyEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers:Errors', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Throw error', async () => {
    let throwError: any

    try {
      Errors.throwError('cavapas', {
        probleme: 'caca',
      })
    } catch (err: any) {
      throwError = err
      expect(err).to.have.property('message', 'cavapas')
      expect(err).to.have.property('probleme', 'caca')
    }

    expect(throwError).be.instanceof(Error)
    expect(throwError.message).to.eq('cavapas')
  })

  it('assert error', async () => {
    let throwError: any

    try {
      Errors.assert(false, 'cavapas', {
        probleme: 'caca',
      })
    } catch (err: any) {
      throwError = err
      expect(err).to.have.property('message', 'cavapas')
      expect(err).to.have.property('probleme', 'caca')
    }

    expect(throwError).be.instanceof(Error)
    expect(throwError.message).to.eq('cavapas')
  })

  it('Assert true', async () => {
    expect(() => {
      Errors.assert(true, 'cavapas', {
        probleme: 'caca',
      })
    }).not.throw()
  })

  it('Should handle unknown error code in throwExposable', () => {
    let capturedError: any
    try {
      Errors.throwExposable('non_existent_code')
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property('message', ErrorKeyEnum.unknownErrorCode)
  })

  it('Should cast a standard error to an exposable error', () => {
    const standardError = new Error('badParams')
    let capturedError: any
    try {
      Errors.castExposable(standardError)
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property('exposeCustom_', true)
    expect(capturedError).to.have.property('message', 'badParams')
    expect(capturedError).to.have.property('description', 'Bad parameters')
  })

  it('calls throwExposable with exposeCustom_ property', () => {
    const standardError: Error | any = new Error(ErrorKeyEnum.badParams)
    try {
      standardError.exposeCustom_ = true
      Errors.castExposable(standardError)
    } catch (error: any) {
      expect(error.exposeCustom_).to.be.true
      expect(error.message).to.eq(ErrorKeyEnum.badParams)
    }
  })

  it('Should handle entity too large error from body parser', () => {
    const largeEntityError = { type: 'entity.too.large' }
    let capturedError: any
    try {
      Errors.bodyParserError(largeEntityError)
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property('message', ErrorKeyEnum.entityTooLarge)
  })

  it('Should handle other errors from body parser as bad parameters', () => {
    const otherError = { message: 'Other error' }
    let capturedError: any
    try {
      Errors.bodyParserError(otherError)
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property('message', ErrorKeyEnum.badParams)
    expect(capturedError).to.have.property('description', 'Other error')
  })

  describe('assertExposable function', () => {
    it('does not throw an error when the condition is true', () => {
      expect(() => {
        Errors.assertExposable(true, ErrorKeyEnum.badParams)
      }).not.to.throw()
    })

    it('throws an exposable error with correct properties when the condition is false', () => {
      try {
        Errors.assertExposable(false, ErrorKeyEnum.badParams, 400, 'Bad parameters', {
          additional: 'info',
        })
        throw new Error('assertExposable did not throw')
      } catch (error) {
        expect(error).to.have.property('exposeCustom_', true)
        expect(error).to.have.property('message', ErrorKeyEnum.badParams)
        expect(error).to.have.property('status', 400)
        expect(error).to.have.property('description', 'Bad parameters')
        expect(error).to.have.property('exposeMeta').that.deep.equals({ additional: 'info' })
      }
    })
  })
})
