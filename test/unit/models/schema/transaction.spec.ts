import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITokenType, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import { beforeEach } from 'mocha'
import ModelUtils from '@models/utils/models'
import { FakeTransaction } from '@test/mock/fakeTransaction'
describe('Model: Transaction', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTransaction = {
      ...FakeTransaction,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Transaction', async () => {
    const entityId = Models.Transaction.getEntityId({
      transactionHash: rawTransaction.transactionHash!,
      category: rawTransaction.category!,
      network: rawTransaction.network!,
      uniqueId: rawTransaction.uniqueId!,
      daoAddress: rawTransaction.daoAddress!,
    })
    const createdToken = await Models.Transaction.create(rawTransaction)

    expect(createdToken.id).to.eq(entityId)
    expect(createdToken.transactionHash).to.eq(rawTransaction.transactionHash)
    expect(createdToken.blockNumber).to.eq(rawTransaction.blockNumber)
    expect(createdToken.network).to.eq(rawTransaction.network)
    expect(createdToken.type).to.eq(rawTransaction.type)
    expect(createdToken.uniqueId).to.eq(rawTransaction.uniqueId)
    expect(createdToken.category).to.eq(rawTransaction.category)
    expect(createdToken.fromAddress).to.eq(rawTransaction.fromAddress)
    expect(createdToken.toAddress).to.eq(rawTransaction.toAddress)
    expect(createdToken.value).to.eq(rawTransaction.value)
    expect(createdToken.tokenAddress).to.eq(rawTransaction.tokenAddress)
    expect(createdToken.daoAddress).to.eq(rawTransaction.daoAddress)
    expect(createdToken.proposalId).to.eq(rawTransaction.proposalId)
    expect(createdToken.token.address).to.eq(rawTransaction.token?.address)
    expect(createdToken.token.symbol).to.eq(rawTransaction.token?.symbol!.toUpperCase())
    expect(createdToken.token.name).to.eq(rawTransaction.token?.name)
    expect(createdToken.token.type).to.eq(rawTransaction.token?.type)
    expect(createdToken.token.logo).to.eq(rawTransaction.token?.logo)
    expect(createdToken.token.decimals).to.eq(rawTransaction.token?.decimals)
    expect(createdToken.token.snapshot.priceUsd).to.eq(rawTransaction.token?.snapshot.priceUsd)
    expect(createdToken.token.snapshot.priceUpdatedAt).to.eq(rawTransaction.token?.snapshot.priceUpdatedAt)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0X123123BAD'
    const uniqueId = '0X123'
    const category = ITransactionCategory.ERC20
    const network = NetworksEnum.ethereumMainnet
    const daoAddress = '0xdao'
    const entityId = Models.Transaction.getEntityId({ transactionHash, category, network, uniqueId, daoAddress })
    expect(entityId).to.eq(`${transactionHash}-${uniqueId}-${category}-${daoAddress}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Transaction.create(rawTransaction)
    const foundLogDao = await Models.Transaction.findExistingLog({
      transactionHash: createdLogDao.transactionHash,
      category: createdLogDao.category,
      network: createdLogDao.network,
      uniqueId: createdLogDao.uniqueId,
      daoAddress: createdLogDao.daoAddress,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Transaction.create(rawTransaction)
    const foundLogDao = await Models.Transaction.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should update Transaction', async () => {
    const createdToken = await Models.Transaction.create(rawTransaction)
    expect(createdToken.address).to.eq(rawTransaction.address)

    await createdToken.update({
      tokenAddress: '0x162433c934aA74ba147E05150B1206b2C922f71d',
    })

    expect(createdToken.tokenAddress).to.eq('0x162433c934aA74ba147E05150B1206b2C922f71d')
  })

  it('Should reload', async () => {
    const createdToken = await Models.Transaction.create(rawTransaction)
    await createdToken.reload()

    expect(createdToken.address).to.eq(rawTransaction.address)
  })

  describe('pagination', () => {
    beforeEach(async () => {
      const rawTxs = [
        {
          transactionHash: '0xb02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          blockNumber: 1,
          uniqueId: '0x123',
          network: NetworksEnum.ethereumMainnet,
          type: ITransactionType.deposit,
          category: ITransactionCategory.Internal,
          fromAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc0',
          toAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
          value: '0x0',
          tokenAddress: rawTransaction.tokenAddress,
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc8',
          tokenId: '1',
          erc721TokenId: '1',
          erc1155Metadata: [
            {
              tokenId: '1',
              value: '0',
            },
          ],
          proposalId: '18',
          token: {
            network: NetworksEnum.ethereumMainnet,
            address: rawTransaction.tokenAddress,
            symbol: 'Test',
            name: 'Test Token',
            type: ITokenType.ERC20,
            logo: 'fake-logo',
            decimals: 18,
          },
        },
        {
          transactionHash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          blockNumber: 1,
          uniqueId: '0x1234',
          network: NetworksEnum.ethereumMainnet,
          type: ITransactionType.deposit,
          category: ITransactionCategory.Internal,
          fromAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc0',
          toAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
          value: '0x0',
          tokenAddress: rawTransaction.tokenAddress,
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc8',
          tokenId: '1',
          erc721TokenId: '1',
          erc1155Metadata: [
            {
              tokenId: '1',
              value: '0',
            },
          ],
          proposalId: '19',
          token: {
            network: NetworksEnum.ethereumMainnet,
            address: rawTransaction.tokenAddress,
            symbol: 'Test',
            name: 'Test Token',
            type: ITokenType.ERC20,
            logo: 'fake-logo',
            decimals: 18,
          },
        },
      ]

      await Promise.all(rawTxs.map(rawTx => Models.Transaction.create(rawTx)))
    })

    it('Should paginate', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Transaction.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data).to.have.lengthOf(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should paginate with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Transaction.findWithPagination({
        extraParams: { daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc8' },
        paginationParams: {},
      })

      expect(data).to.have.lengthOf(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should paginate with tokenAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Transaction.findWithPagination({
        extraParams: { tokenAddress: rawTransaction.tokenAddress },
        paginationParams: {},
      })

      expect(data).to.have.lengthOf(2)
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
      } = await Models.Transaction.findWithPagination({
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

    it('Should not found documents', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Transaction.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(0)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
    })
  })

  it('Should filterKeys', async () => {
    const createdDao = await Models.Transaction.create(rawTransaction)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.id).to.be.undefined
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.tokenAddress).to.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(filterDao.token._id).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(17)
  })

  it('Should filterKeys without token', async () => {
    const createdWithoutToken = await Models.Transaction.create({ ...rawTransaction, ...{ token: undefined } })
    const withoutToken = createdWithoutToken.filterKeys()
    expect(withoutToken.token).to.be.undefined
  })
})
