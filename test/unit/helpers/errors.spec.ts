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
})
