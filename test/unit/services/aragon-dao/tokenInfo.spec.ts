import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { TokenInfo } from '@services/aragon-dao/tokenInfo'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('tokenInfo', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchMetrics', () => {
    it('should update token metrics in the database', async () => {
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumSepolia

      const tokenMetricsMock = {
        totalSupply: '1000',
        totalHolders: 10,
      }

      const tokenMock = {
        id: '123',
        totalSupply: '1000',
        holders: 10,
      }

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(tokenMetricsMock)

      const findByTokenAddressStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves(tokenMock as any)

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await TokenInfo.fetchMetrics(tokenAddress, network)

      expect(getTokenSupplyAndHoldersStub.calledOnceWith(tokenAddress, network)).to.be.true
      expect(findByTokenAddressStub.calledOnceWith(tokenAddress, network)).to.be.true
      expect(
        updateDocumentStub.calledOnceWith(
          tokenMock,
          {
            totalSupply: tokenMetricsMock.totalSupply,
            holders: tokenMetricsMock.totalHolders,
          },
          sinon.match.any,
          'Token Metrics Updated',
          sinon.match.any,
        ),
      ).to.be.true

      expect(tokenMock.totalSupply).to.equal(tokenMetricsMock.totalSupply)
      expect(tokenMock.holders).to.equal(tokenMetricsMock.totalHolders)
    })
  })

  describe('_retryAndFetch', () => {
    it('should fetch metrics within the timeout period', async () => {
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumSepolia
      const tokenMetricsMock = {
        totalSupply: '1000',
        totalHolders: 10,
      }

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(tokenMetricsMock)

      const result = await TokenInfo._retryAndFetch(tokenAddress, network, 500, 5000)

      expect(getTokenSupplyAndHoldersStub.calledOnceWith(tokenAddress, network)).to.be.true
      expect(result).to.deep.equal(tokenMetricsMock)
    })

    it('should reject if polling times out', async () => {
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumSepolia

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves({ totalSupply: '0', totalHolders: 0 })

      try {
        await TokenInfo._retryAndFetch(tokenAddress, network, 500, 2000)
        expect.fail('Expected promise to be rejected')
      } catch (error: any) {
        expect(error.message).to.equal('Polling timed out')
      }

      expect(getTokenSupplyAndHoldersStub.called).to.be.true
    })
  })
})
