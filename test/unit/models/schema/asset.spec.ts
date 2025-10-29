import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { HexAddress, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Asset from '@models/schema/asset'
import ModelUtils from '@models/utils/models'
import { FakeAsset } from '@test/mock/fakeAsset'
import { FakeToken } from '@test/mock/fakeToken'
import Token from '@models/schema/token'

describe('Model: Asset', () => {
  let sandbox: SinonSandbox
  let rawAsset: Partial<Asset>
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawAsset = {
      ...FakeAsset,
    }

    rawToken = {
      ...(FakeToken as any),
      address: FakeAsset.tokenAddress,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Asset', async () => {
    const entityId = Models.Asset.getEntityId({
      daoAddress: rawAsset.daoAddress!,
      tokenAddress: rawAsset.tokenAddress!,
      network: rawAsset.network!,
    })
    const createdAsset = await Models.Asset.create(rawAsset)

    expect(createdAsset.id).to.eq(entityId)
    expect(createdAsset.network).to.eq(rawAsset.network)
    expect(createdAsset.daoAddress).to.eq(rawAsset.daoAddress)
    expect(createdAsset.tokenAddress).to.eq(rawAsset.tokenAddress)
    expect(createdAsset.amount).to.eq(rawAsset.amount)
  })

  it('Should getEntityId', async () => {
    const daoAddress = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const tokenAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Asset.getEntityId({ daoAddress, tokenAddress, network })
    expect(entityId).to.eq(`${daoAddress}-${tokenAddress}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Asset.create(rawAsset)
    const foundLogDao = await Models.Asset.findExistingLog({
      daoAddress: rawAsset.daoAddress as HexAddress,
      tokenAddress: rawAsset.tokenAddress as HexAddress,
      network: rawAsset.network as NetworksEnum,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Asset.create(rawAsset)
    const foundLogDao = await Models.Asset.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should update Asset', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    expect(createdAsset.amount).to.eq(rawAsset.amount)

    await createdAsset.update({
      amount: '90',
    })

    expect(createdAsset.amount).to.eq('90')
  })

  it('Should not update required field with falsy value', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    const originalDaoAddress = createdAsset.daoAddress

    // Try to update required field with null - should not update
    await createdAsset.update({
      daoAddress: null as any,
    })

    expect(createdAsset.daoAddress).to.eq(originalDaoAddress)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)

    // Try to update with non-existent field
    await createdAsset.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(createdAsset).to.exist
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeAsset = [
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
          tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '2423423',
        },
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc3',
          tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc4',
          amount: '3223423',
        },
        {
          network: NetworksEnum.polygonMainnet,
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc3',
          tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc4',
          amount: '3223423',
        },
      ]

      await Promise.all(fakeAsset.map(w => Models.Asset.create(w)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Asset.findWithPagination({ daoAddress: null }, {})
      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Asset.findWithPagination({
        extraParams: { daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc3' },
        paginationParams: {},
      })
      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Asset.findWithPagination({
        extraParams: { daoAddress: '0x0000000000000000000000000000000000000000' },
        paginationParams: {},
      })

      expect(spyUtils.calledOnce).to.be.true
      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })
  })

  it('Should reload', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    await createdAsset.reload()

    expect(createdAsset.tokenAddress).to.eq(rawAsset.tokenAddress)
  })

  it('should get dao tvl', async () => {
    await Models.Asset.create(rawAsset)
    const rawTokenDb = await Models.Token.findOne({ address: rawAsset.tokenAddress })
    await rawTokenDb?.update({ priceUsd: '123.23' })
    const tvlUsd = await Models.Asset.getDaoTvl(rawAsset.daoAddress, rawAsset.network)
    expect(tvlUsd).to.be.eq(12365.27)
  })
})
