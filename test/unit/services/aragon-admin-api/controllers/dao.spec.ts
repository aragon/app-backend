import { Models } from '@dbModels'
import * as errors from '@errors'
import DaoAdminController from '@services/aragon-admin-api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

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
      const fakeDao = { isHidden: true, save: saveStub }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(fakeDao)

      const result = await DaoAdminController.setVisibilityStatus({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        status: true,
      })

      expect(result).to.be.true
      expect(fakeDao.isHidden).to.be.false
      expect(saveStub.calledOnce).to.be.true
    })

    it('should set isHidden to true if status is false (hidden)', async () => {
      const saveStub = sandbox.stub().resolves(true)
      const fakeDao = { isHidden: false, save: saveStub }
      sandbox.stub(Models.Dao, 'findByAddress').resolves(fakeDao)

      const result = await DaoAdminController.setVisibilityStatus({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        status: false,
      })

      expect(result).to.be.true
      expect(fakeDao.isHidden).to.be.true
      expect(saveStub.calledOnce).to.be.true
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
