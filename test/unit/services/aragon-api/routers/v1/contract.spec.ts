import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ContractRouter from '@api/routers/v1/contract'
import ContractController from '@api/controllers/contract'
import ValidationSchema from '@helpers/validationSchema'
import ContractDetailsSchema from '@api/routers/schema/contract'
import { NetworksEnum } from '@types'

describe('RouterV1: Contract', () => {
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

      const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves(validatedParams)
      const controllerStub = sandbox.stub(ContractController, 'getContractDetails').resolves(mockResponse)

      const ctx: any = {
        params: mockParams,
        body: null,
      }

      await ContractRouter.getDetails(ctx)

      expect(validateParamsStub.calledOnceWith(ContractDetailsSchema.getContractDetails, mockParams)).to.be.true
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
})
