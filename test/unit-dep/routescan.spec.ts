import * as sinon from 'sinon'
import { NetworksEnum } from '@types'
import RouteScanHelper from '@helpers/routeScanHelper'
import { expect } from 'chai'

describe('Route Scan: Integration Test', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get the contract source code', async () => {
    const daoAddress = '0x8112b792C31d94C186e7e3Ad2c35b07534084ce2'
    const network = NetworksEnum.cornMainnet

    const response = await RouteScanHelper.fetchContractSourceCode({
      address: daoAddress,
      network,
    })
    expect(response).to.be.an('array')
    expect(response![0]).to.have.property('SourceCode')
    expect(response![0]).to.have.property('ContractName')
  })

  it('should get the contract creation details', async () => {
    const daoAddress = '0x8112b792C31d94C186e7e3Ad2c35b07534084ce2'
    const network = NetworksEnum.cornMainnet
    const response = await RouteScanHelper.fetchContractCreation({
      address: daoAddress,
      network,
    })
    expect(response).to.be.an('object')
    expect(response).to.have.property('address')
    expect(response).to.have.property('transactionHash')
    expect(response).to.have.property('blockNumber')
  })
})
