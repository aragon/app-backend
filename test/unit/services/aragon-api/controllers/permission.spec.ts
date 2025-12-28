import { Models } from '@dbModels'
import PermissionController from '@services/aragon-api/controllers/permission'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Permission', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getPermissionsByDao', () => {
    it('should get permissions by dao address and network', async () => {
      const daoAddress = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'
      const network = NetworksEnum.ethereumSepolia
      const paginationParams = {
        pageSize: 10,
        page: 1,
      }

      const mockResponse = {
        data: [
          {
            daoAddress,
            network,
            permissionId: '0xPERM1',
            whoAddress: '0xWHO1',
            whereAddress: '0xWHERE1',
          },
        ],
        metadata: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 },
      }

      const stubFindWithPagination = sandbox.stub(Models.DaoPermission, 'findWithPagination').resolves(mockResponse)

      const result = await PermissionController.getPermissionsByDao(daoAddress, network, paginationParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams: { daoAddress, network },
          paginationParams,
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should pass pagination params correctly', async () => {
      const daoAddress = '0xDAO123'
      const network = NetworksEnum.ethereumMainnet
      const paginationParams = {
        pageSize: 20,
        page: 2,
        sort: 'blockNumber',
        order: 'desc',
      }

      const mockResponse = {
        data: [],
        metadata: { page: 2, pageSize: 20, totalPages: 0, totalRecords: 0 },
      }

      const stubFindWithPagination = sandbox.stub(Models.DaoPermission, 'findWithPagination').resolves(mockResponse)

      const result = await PermissionController.getPermissionsByDao(daoAddress, network, paginationParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(stubFindWithPagination.args[0][0]).to.deep.equal({
        extraParams: { daoAddress, network },
        paginationParams,
      })
      expect(result).to.deep.equal(mockResponse)
    })
  })
})
