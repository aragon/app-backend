import ContractController from '@api/controllers/contract'
import ContractRouter from '@api/routers/v2/contract'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Contract', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDetails', () => {
    it('should call the controller and return contract details', async () => {
      const mockParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      }
      const validatedParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      } as any
      const mockResponse = { contractName: 'TestContract', address: '0x123' } as any

      sandbox.stub(ValidationSchema, 'validateParams').resolves(validatedParams)
      const controllerStub = sandbox.stub(ContractController, 'getContractDetails').resolves(mockResponse)

      const ctx: any = {
        query: {},
        params: mockParams,
        body: null,
      }

      await ContractRouter.getDetails(ctx)

      expect(controllerStub.calledOnceWith(validatedParams)).to.be.true
      expect(ctx.body).to.deep.equal(mockResponse)
    })

    it('should decode the action data of a contract', async () => {
      const mockParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      }
      const validatedParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
        from: '0x123',
        to: '0xab',
        data: '0x123',
        value: '0x123',
      } as any

      sandbox.stub(ValidationSchema, 'validateParams').resolves(validatedParams)
      const controllerStub = sandbox.stub(ContractController, 'decodeContractData').resolves(true as any)

      const ctx: any = {
        params: mockParams,
        query: {},
        request: {
          body: {
            from: '0x123',
            data: '0x123',
            value: '0x123',
          },
        },
      }

      await ContractRouter.decodeActionData(ctx)

      expect(controllerStub.calledOnceWith(validatedParams)).to.be.true
    })
  })

  describe('decodeActionBatch', () => {
    it('should decode batch actions and return results', async () => {
      const validatedParams = {
        network: NetworksEnum.ethereumMainnet,
        from: '0xDAO',
        actions: [
          { to: '0xRecipient1', data: '0x', value: '1000' },
          { to: '0xRecipient2', data: '0x', value: '2000' },
        ],
      } as any

      const mockResponse = [
        { type: 'TransferNative', from: '0xDAO', to: '0xRecipient1' },
        { type: 'TransferNative', from: '0xDAO', to: '0xRecipient2' },
      ] as any

      sandbox.stub(ValidationSchema, 'validateParams').resolves(validatedParams)
      const controllerStub = sandbox.stub(ContractController, 'decodeContractDataBatch').resolves(mockResponse)

      const ctx: any = {
        params: {
          network: NetworksEnum.ethereumMainnet,
          from: '0xDAO',
        },
        query: {},
        request: {
          body: [
            { to: '0xRecipient1', data: '0x', value: '1000' },
            { to: '0xRecipient2', data: '0x', value: '2000' },
          ],
        },
        body: null,
      }

      await ContractRouter.decodeActionBatch(ctx)

      expect(controllerStub.calledOnceWith(validatedParams)).to.be.true
      expect(ctx.body).to.deep.equal(mockResponse)
    })
  })
})
