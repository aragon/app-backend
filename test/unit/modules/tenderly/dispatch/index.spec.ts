import TenderlyDispatch from '@modules/tenderly/dispatch'
import { expect } from 'chai'

describe('Module: tenderly/dispatch/index', () => {
  it('exports the dispatch service with load and simulate', () => {
    expect(TenderlyDispatch.load).to.be.a('function')
    expect(TenderlyDispatch.simulate).to.be.a('function')
  })
})
