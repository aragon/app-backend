import * as sinon from 'sinon'
import { expect } from 'chai'
import DaoAdminController from '@services/aragon-admin-api/controllers/dao'
import { Models } from '@dbModels'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import * as errors from '@errors'

describe('Controller: DaoAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('setVisibilityStatus', () => {
    it('should set isHidden to false if status is true (visible)', async () => {
      const saveStub = sandbox.stub().resolves(true)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ save: saveStub })

      const result = await DaoAdminController.setVisibilityStatus({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        status: true,
      })

      expect(result).to.be.true
      expect(saveStub.calledOnceWith({ isHidden: false })).to.be.true
    })

    it('should set isHidden to true if status is false (hidden)', async () => {
      const saveStub = sandbox.stub().resolves(true)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ save: saveStub })

      const result = await DaoAdminController.setVisibilityStatus({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        status: false,
      })

      expect(result).to.be.true
      expect(saveStub.calledOnceWith({ isHidden: true })).to.be.true
    })

    it('should throw error if DAO is not found', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        DaoAdminController.setVisibilityStatus({
          address: '0x123',
          network: NetworksEnum.ethereumMainnet,
          status: true,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.calledOnce).to.be.true
    })
  })
})
