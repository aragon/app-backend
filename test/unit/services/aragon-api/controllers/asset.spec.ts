import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AssetController from '@services/aragon-api/controllers/asset'
import { Models } from '@dbModels'
import Asset from '@models/schema/asset'
import Token from '@models/schema/token'
import PairDataModule from '@modules/pairData'
import { FakeAsset } from '@test/mock/fakeAsset'
import { FakeToken } from '@test/mock/fakeToken'
import Dao from '@models/schema/dao'
import { DaoList } from '@test/mock/fakeDao'

describe('Controller: Asset', () => {
  let sandbox: SinonSandbox
  let rawAsset: Partial<Asset>
  let rawToken: Partial<Token>
  let fakeDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawAsset = {
      ...FakeAsset,
    }

    rawToken = {
      ...(FakeToken as any),
    }

    fakeDao = {
      ...(DaoList[0] as any),
      address: FakeAsset.daoAddress,
    }

    rawToken.address = FakeAsset.tokenAddress

    await Models.Asset.create(FakeAsset)
    await Models.Token.create(FakeToken)
    await Models.Dao.create(fakeDao)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getAssetsWithPagination', () => {
    it('should get assets with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawAsset.network,
        daoAddress: rawAsset.daoAddress,
      }

      const spyReq = sandbox.spy(Models.Asset, 'findWithPagination')

      const response = await AssetController.getAssetsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      const responseData = response.data[0] as any
      expect(responseData.network).to.eq(rawAsset.network)
      expect(responseData.amount).to.eq(rawAsset.amount)
      expect(responseData.token).to.be.exist
      expect(responseData.token.address).to.be.eq(rawAsset.tokenAddress)
      expect(responseData.token.name).to.be.eq(rawToken.name)
      expect(responseData.token.symbol).to.be.eq(rawToken.symbol)
      expect(responseData.dao).to.be.exist
      expect(responseData.dao.address).to.be.eq(rawAsset.daoAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get assets no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: undefined,
        daoAddress: undefined,
      }

      const spyReq = sandbox.spy(Models.Asset, 'findWithPagination')

      const response = await AssetController.getAssetsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      const responseData = response.data[0] as any
      expect(responseData.network).to.eq(rawAsset.network)
      expect(responseData.amount).to.eq(rawAsset.amount)
      expect(responseData.token).to.be.exist
      expect(responseData.token.address).to.be.eq(rawAsset.tokenAddress)
      expect(responseData.token.name).to.be.eq(rawToken.name)
      expect(responseData.token.symbol).to.be.eq(rawToken.symbol)
      expect(responseData.dao).to.be.undefined
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should call getAssetsWithPagination with no arguments (default parameters)', async () => {
      const spyReq = sandbox.spy(Models.Asset, 'findWithPagination')

      const response = await AssetController.getAssetsWithPagination()

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {},
          paginationParams: {},
        }),
      ).to.be.true

      expect(response).to.have.property('data')
    })

    it('should handle when findWithPagination returns empty results', async () => {
      sandbox.stub(Models.Asset, 'findWithPagination').resolves({
        data: [],
        metadata: {
          page: 1,
          totalPages: 0,
          totalRecords: 0,
        },
      })

      const response = await AssetController.getAssetsWithPagination()

      expect(response).to.have.property('data').with.lengthOf(0)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(0)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should handle when findWithPagination throws an error', async () => {
      sandbox.stub(Models.Asset, 'findWithPagination').rejects(new Error('DB connection error'))

      try {
        await AssetController.getAssetsWithPagination()
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('DB connection error')
      }
    })

    it('should handle when pairFromExtraParams throws an error', async () => {
      sandbox.stub(PairDataModule, 'pairFromExtraParams').rejects(new Error('Invalid pair params'))

      try {
        await AssetController.getAssetsWithPagination({}, {}, { daoId: 'invalid-id' })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('Invalid pair params')
      }
    })

    it('should get proposals with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawAsset.daos?.[0].network}-${rawAsset.daos?.[0].daoAddress}`,
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawAsset.daos?.[0].daoAddress,
        network: rawAsset.daos?.[0].network,
      })
      const spyReq = sandbox.spy(Models.Asset, 'findWithPagination')

      const response = await AssetController.getAssetsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawAsset.daos?.[0].daoAddress,
            network: rawAsset.daos?.[0].network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      const responseData = response.data[0] as any
      expect(responseData.network).to.eq(rawAsset.network)
      expect(responseData.amount).to.eq(rawAsset.amount)
      expect(responseData.token).to.be.exist
      expect(responseData.token.address).to.be.eq(rawAsset.tokenAddress)
      expect(responseData.token.name).to.be.eq(rawToken.name)
      expect(responseData.token.symbol).to.be.eq(rawToken.symbol)
      expect(responseData.dao).to.be.undefined
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawAsset.daos?.[0].network}-${rawAsset.daos?.[0].daoAddress}`,
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)

      const spyReq = sandbox.spy(Models.Asset, 'findWithPagination')

      const response = await AssetController.getAssetsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })

    it('should handle invalid pagination parameters', async () => {
      const invalidPaginationParams = {
        page: -1,
        pageSize: -10,
        order: 'invalid',
      }
      let response: any

      try {
        response = await AssetController.getAssetsWithPagination(invalidPaginationParams as any)
      } catch (e: any) {
        // Handle the error if necessary
        expect(e).to.be.an('error')
        expect(e.message).to.include('invalid argument to $skip')
      }

      // We'll let the controller handle invalid params - this test ensures we exercise that code path

      // The response should still be structured correctly
      expect(response).be.undefined
    })
  })
})
