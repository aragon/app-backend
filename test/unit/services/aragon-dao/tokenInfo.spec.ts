import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import TokenMetrics from '@services/aragon-dao/tokenInfo'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import logger from '@logger'

describe('TokenInfo Service', () => {
  let sandbox: SinonSandbox
  const tokenAddress = '0xTokenAddress'
  const network = NetworksEnum.ethereumSepolia

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchMetrics', () => {
    let findByTokenAddressStub: SinonStub
    let updateDocumentStub: SinonStub
    let getTokenSupplyStub: SinonStub
    let errorStub: SinonStub
    let warnStub: SinonStub

    beforeEach(() => {
      findByTokenAddressStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork')
      updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      getTokenSupplyStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders')
      errorStub = sandbox.stub(logger, 'error')
      warnStub = sandbox.stub(logger, 'warn')
    })

    it('should update metrics when token has invalid initial data', async () => {
      // Arrange
      const tokenMock = {
        id: '123',
        address: tokenAddress,
        totalSupply: '0',
        holders: 0,
      }
      const metricsMock = { totalSupply: '1000', totalHolders: 10 }

      findByTokenAddressStub.resolves(tokenMock)
      getTokenSupplyStub.resolves(metricsMock)

      await TokenMetrics.update(tokenAddress, network)

      expect(findByTokenAddressStub.calledWith(tokenAddress, network)).to.be.true
      expect(getTokenSupplyStub.calledWith(tokenAddress, network)).to.be.true
    })

    it('should skip update when token already has valid metrics', async () => {
      // Arrange
      const tokenMock = {
        id: '123',
        address: tokenAddress,
        totalSupply: '500',
        holders: 5,
      }

      findByTokenAddressStub.resolves(tokenMock)

      // Act & Assert
      await TokenMetrics.update(tokenAddress, network)

      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(getTokenSupplyStub.calledOnce).to.be.false
      expect(updateDocumentStub.calledOnce).to.be.false
      expect(warnStub.calledOnce).to.be.true
    })

    it('should handle polling timeout scenario', async () => {
      getTokenSupplyStub.resolves({ totalSupply: '0', totalHolders: 0 })

      await expect(
        TokenMetrics.pollWithRetry(tokenAddress, network, { intervalMs: 100, timeoutMs: 500 }),
      ).to.be.rejectedWith(/Token metrics polling timed out after \d+ms/)
    })

    it('should handle API errors during metrics fetch', async () => {
      // Arrange
      const tokenMock = {
        id: '123',
        address: tokenAddress,
        totalSupply: '0',
        holders: 0,
      }

      findByTokenAddressStub.resolves(tokenMock)
      getTokenSupplyStub.rejects(new Error('API Error'))

      await expect(TokenMetrics.pollWithRetry(tokenAddress, network)).to.be.rejectedWith('API Error')
      expect(errorStub.calledOnce).to.be.true
    })
  })
})
