import { Models } from '@dbModels'
import PolicyController from '@services/aragon-api/controllers/policy'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Policy', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getPoliciesByDao', () => {
    it('should get policies for a DAO', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({ subDaos: [] } as any)
      const findPoliciesStub = sandbox.stub(Models.Plugin, 'findPoliciesByDao').resolves(mockPolicies as any)

      const result = await PolicyController.getPoliciesByDao({
        daoAddress: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        onlyParent: false,
      })

      expect(findByAddressStub.calledOnce).to.be.true
      expect(findPoliciesStub.calledOnce).to.be.true
      expect(result).to.deep.eq(mockPolicies)
    })

    it('should include subDaos when dao has subDaos and onlyParent is false', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const subDaos = ['0xSubDao1', '0xSubDao2']
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ subDaos } as any)
      const findPoliciesStub = sandbox.stub(Models.Plugin, 'findPoliciesByDao').resolves(mockPolicies as any)

      await PolicyController.getPoliciesByDao({
        daoAddress: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        onlyParent: false,
      })

      expect(findPoliciesStub.calledOnce).to.be.true
      const calledParams = findPoliciesStub.args[0][0]
      expect(calledParams.daoAddresses).to.deep.eq(['0xDaoAddress', '0xSubDao1', '0xSubDao2'])
    })

    it('should not include subDaos when onlyParent is true', async () => {
      const mockPolicies = [{ id: '1', address: '0xPolicy1' }]
      const subDaos = ['0xSubDao1', '0xSubDao2']
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ subDaos } as any)
      const findPoliciesStub = sandbox.stub(Models.Plugin, 'findPoliciesByDao').resolves(mockPolicies as any)

      await PolicyController.getPoliciesByDao({
        daoAddress: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        onlyParent: true,
      })

      expect(findPoliciesStub.calledOnce).to.be.true
      const calledParams = findPoliciesStub.args[0][0]
      expect(calledParams.daoAddresses).to.be.undefined
    })

    it('should handle when dao not found', async () => {
      const mockPolicies: any[] = []
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const findPoliciesStub = sandbox.stub(Models.Plugin, 'findPoliciesByDao').resolves(mockPolicies as any)

      const result = await PolicyController.getPoliciesByDao({
        daoAddress: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        onlyParent: false,
      })

      expect(findPoliciesStub.calledOnce).to.be.true
      expect(result).to.deep.eq(mockPolicies)
    })
  })
})
