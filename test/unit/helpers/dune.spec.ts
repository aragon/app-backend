import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DuneHelper from '@helpers/dune'
import logger from '@logger'

describe('Helpers: Dune', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('_rpCall', () => {
    it('should successfully make an API call and return data', async () => {
      const fakeResponse = {
        data: {
          request_time: '2024-05-29T01:13:28.968Z',
          response_time: '2024-05-29T01:13:29.007Z',
          wallet_address: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
          balances: [
            {
              chain: 'ethereum',
              chain_id: 1,
              address: 'native',
              amount: '75000000000000000000',
              symbol: 'ETH',
              decimals: 18,
              price_usd: 2500,
              value_usd: 187500,
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(DuneHelper, 'axiosInstance').resolves(fakeResponse)

      const response = await DuneHelper.getBalance('0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254')

      expect(axiosStub.calledOnce).to.be.true
      expect(response).to.deep.equal(fakeResponse.data)
    })

    it('should handle errors in API call', async () => {
      sandbox.stub(DuneHelper, 'axiosInstance').rejects(new Error('Network error'))
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(DuneHelper.getBalance('0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254')).to.be.rejectedWith(
        Error as any,
        'Network error',
      )
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  it('getBalance', async () => {
    sandbox.stub(DuneHelper, 'axiosInstance').rejects(new Error('Network error'))
    sandbox.stub(DuneHelper, '_rpCall').resolves({ data: 1 } as any)

    const balance = await DuneHelper.getBalance('0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254')

    expect(balance).to.eq(1)
  })
})
