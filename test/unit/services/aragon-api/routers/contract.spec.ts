import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ContractRouter from '@services/aragon-api/routers/contract'
import ContractController from '@services/aragon-api/controllers/contract'
import ValidationSchema from '@helpers/validationSchema'
import ContractDetailsSchema from '@services/aragon-api/routers/schema/contract'
import { NetworksEnum } from '@types'

describe('Router: Contract', () => {
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
  })
})
