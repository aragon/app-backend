import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import EtherscanHelper from '@helpers/etherscan'

describe('Manual: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should fetchAllTransactions', async () => {
    const daoFactoryAddress = '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0'
    const response = await EtherscanHelper.fetchAllTransactions(daoFactoryAddress)
    console.log(response) // eslint-disable-line no-console
  })
})
