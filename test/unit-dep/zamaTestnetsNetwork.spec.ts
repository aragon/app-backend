import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import logger from '@logger'
import MongoDB from '@modules/mongo'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integration: Zama testnet explorers (Etherscan V2)', () => {
  let dropStub: sinon.SinonStub
  let sandbox: sinon.SinonSandbox

  before(() => {
    dropStub = sinon.stub(MongoDB, 'drop').resolves()
  })

  after(() => {
    dropStub?.restore()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  for (const network of [
    NetworksEnum.ethereumHoodi,
    NetworksEnum.polygonAmoy,
    NetworksEnum.baseSepolia,
    NetworksEnum.bnbTestnet,
  ]) {
    it(`resolves a recent block on ${network}`, async function () {
      this.timeout(30_000)

      const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3
      const block = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, timestamp, network, 'before')

      expect(block).to.be.a('number').and.greaterThan(0)
    })
  }
})
