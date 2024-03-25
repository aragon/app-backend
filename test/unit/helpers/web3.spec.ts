import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Utils from '@helpers/web3'
import logger from '@logger'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('parseAddress', function () {
    const address = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
    const expectedChecksumAddress = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    const stubLogger = sandbox.stub(logger, 'error')

    const result = Web3Utils.parseAddress(address)

    expect(result).to.equal(expectedChecksumAddress)
    expect(stubLogger.notCalled).to.be.true
  })

  it('error parseAddress', function () {
    const address = '0xInvalidAddress'
    const stubLogger = sandbox.stub(logger, 'error')

    const result = Web3Utils.parseAddress(address)

    expect(result).to.be.null
    expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
  })
})
