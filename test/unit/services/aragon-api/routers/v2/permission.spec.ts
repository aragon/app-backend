import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PermissionRouter from '@api/routers/v2/permission'
import PermissionController from '@api/controllers/permission'
import { NetworksEnum } from '@types'

describe('RouterV2: Permission', () => {
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

      const mockResult = {
        data: [
          {
            daoAddress,
            network,
            permissionId: '0xPERM1',
            whoAddress: '0xWHO1',
            whereAddress: '0xWHERE1',
          },
        ],
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      const stubCtrl = sandbox.stub(PermissionController, 'getPermissionsByDao').returns(mockResult as any)

      const ctx: any = {
        params: {
          daoAddress,
          network,
        },
        query: {},
      }

      await PermissionRouter.getPermissionsByDao(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][0]).to.eq(daoAddress)
      expect(stubCtrl.args[0][1]).to.eq(network)
    })

    it('should handle pagination params', async () => {
      const daoAddress = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'
      const network = NetworksEnum.ethereumSepolia
      const paginationParams = {
        pageSize: 20,
        page: 2,
        order: 'desc',
        sort: 'blockNumber',
      }

      const stubCtrl = sandbox.stub(PermissionController, 'getPermissionsByDao').returns({} as any)

      const ctx: any = {
        params: {
          daoAddress,
          network,
        },
        query: paginationParams,
      }

      await PermissionRouter.getPermissionsByDao(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0][2]).to.deep.include(paginationParams)
    })
  })
})
