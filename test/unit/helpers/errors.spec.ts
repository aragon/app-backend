import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import * as Errors from '@errors'

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
    expect(capturedError).to.have.property(
      'message',
      Errors.ErrorKey.unknownErrorCode,
    )
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

  it('Should handle entity too large error from body parser', () => {
    const largeEntityError = { type: 'entity.too.large' }
    let capturedError: any
    try {
      Errors.bodyParserError(largeEntityError)
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property(
      'message',
      Errors.ErrorKey.entityTooLarge,
    )
  })

  it('Should handle other errors from body parser as bad parameters', () => {
    const otherError = { message: 'Other error' }
    let capturedError: any
    try {
      Errors.bodyParserError(otherError)
    } catch (error) {
      capturedError = error
    }
    expect(capturedError).to.have.property('message', Errors.ErrorKey.badParams)
    expect(capturedError).to.have.property('description', 'Other error')
  })
})
