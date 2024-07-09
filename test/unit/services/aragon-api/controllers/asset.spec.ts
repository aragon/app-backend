import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AssetController from '@services/aragon-api/controllers/asset'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Asset from '@models/schema/asset'
import PairDataModule from '@modules/pairData'

describe('Controller: Asset', () => {
  let sandbox: SinonSandbox
  let rawAsset: Partial<Asset>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawAsset = {
      network: NetworksEnum.ethereumMainnet,
      daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
      amount: '32423423',
      amountUsd: '100',
    }

    await Models.Asset.create(rawAsset)
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
      expect(response.data[0].network).to.eq(rawAsset.network)
      expect(response.data[0].daoAddress).to.eq(rawAsset.daoAddress)
      expect(response.data[0].tokenAddress).to.eq(rawAsset.tokenAddress)
      expect(response.data[0].amount).to.eq(rawAsset.amount)
      expect(response.data[0].token).to.exist
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
      expect(response.data[0].network).to.eq(rawAsset.network)
      expect(response.data[0].daoAddress).to.eq(rawAsset.daoAddress)
      expect(response.data[0].tokenAddress).to.eq(rawAsset.tokenAddress)
      expect(response.data[0].amount).to.eq(rawAsset.amount)
      expect(response.data[0].token).to.exist
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
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
      expect(response.data[0].network).to.eq(rawAsset.network)
      expect(response.data[0].daoAddress).to.eq(rawAsset.daoAddress)
      expect(response.data[0].tokenAddress).to.eq(rawAsset.tokenAddress)
      expect(response.data[0].amount).to.eq(rawAsset.amount)
      expect(response.data[0].token).to.exist
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
  })
})
