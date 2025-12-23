import config from '@config'
import FourByteHelper from '@helpers/4byte'
import Logger from '@logger'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'

describe('Modules:4Byte', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('_rpCall', () => {
    it('should handle the request successfully', async () => {
      const path = '/test-path'
      const fakeResponse = { data: { result: 'success' } }
      const rpcCallStub = sandbox.stub(FourByteHelper.axiosInstance, 'get').resolves(fakeResponse)

      const response: any = await FourByteHelper._rpCall(path)

      expect(response.result).to.deep.equal(fakeResponse.data.result)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.calledWith(`${config.FOUR_BYTE.URI}/test-path`)).to.be.true
    })

    it('should throw an error when the request fails', async () => {
      const path = '/test-path'
      const error = new Error('Test Error')
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(FourByteHelper.axiosInstance, 'get').rejects(error)

      await expect(FourByteHelper._rpCall(path)).to.be.rejectedWith(error, 'Test Error')

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error in 4Byte RPC Call' as any)).to.be.true
    })
  })

  describe('getSignatures', () => {
    it('should return signature when the request is successful', async () => {
      sandbox.stub(FourByteHelper, '_rpCall').resolves(true)

      const price = await FourByteHelper.getSignatures('0x0123123')
      expect(price).to.be.true
    })

    it('should handle errors gracefully', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(FourByteHelper, '_rpCall').rejects(new Error('API Error'))

      const price = await FourByteHelper.getSignatures('0x...')

      expect(price).to.be.undefined
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
