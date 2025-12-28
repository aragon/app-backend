import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import ModelUtils from '@models/utils/models'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { ITokenType, ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    // Updated to use new getEntityId logic
    const createdToken = await Models.Transaction.create(rawTransaction)

    expect(createdToken.id).to.exist
    expect(createdToken.transactionHash).to.eq(rawTransaction.transactionHash)
    expect(createdToken.blockNumber).to.eq(rawTransaction.blockNumber)
    expect(createdToken.network).to.eq(rawTransaction.network)
    expect(createdToken.type).to.eq(rawTransaction.type)
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

  describe('getEntityId with Transfer Types', () => {
    const baseParams = {
      transactionHash: '0x123abc',
      network: NetworksEnum.ethereumMainnet,
      daoAddress: '0xdao123',
    }

    it('Should generate ID for ERC20 transfer', async () => {
      const entityId = Models.Transaction.getEntityId({
        ...baseParams,
        type: ITransactionType.erc20,
        logIndex: 5,
        tokenAddress: '0xtoken123',
      })
      expect(entityId).to.eq('0xdao123-ethereum-mainnet-0x123abc-5-erc20-0xtoken123')
    })

    it('Should generate ID for native transfer', async () => {
      const entityId = Models.Transaction.getEntityId({
        ...baseParams,
        type: ITransactionType.native,
      })
      expect(entityId).to.eq('0xdao123-ethereum-mainnet-0x123abc-native')
    })

    it('Should generate ID for native transfer with actionIndex', async () => {
      const entityId = Models.Transaction.getEntityId({
        ...baseParams,
        type: ITransactionType.native,
        actionIndex: 2,
      })
      expect(entityId).to.eq('0xdao123-ethereum-mainnet-0x123abc-native-action2')
    })

    it('Should generate ID for ERC721 transfer', async () => {
      const entityId = Models.Transaction.getEntityId({
        ...baseParams,
        type: ITransactionType.erc721,
        logIndex: 3,
        tokenAddress: '0xnft123',
        tokenId: '42',
      })
      expect(entityId).to.eq('0xdao123-ethereum-mainnet-0x123abc-3-nft-0xnft123-42')
    })
  })

  it('Should create Transaction with actionIndex for batch native transfers', async () => {
    const batchTx = {
      ...rawTransaction,
      tokenAddress: '0x0000000000000000000000000000000000000000',
      actionIndex: 3,
    }
    const createdTx = await Models.Transaction.create(batchTx)
    expect(createdTx.actionIndex).to.eq(3)
    expect(createdTx.id).to.include('native-action3')
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Transaction.create(rawTransaction)
    const foundLogDao = await Models.Transaction.findExistingLog({
      transactionHash: createdLogDao.transactionHash,
      network: createdLogDao.network,
      daoAddress: createdLogDao.daoAddress,
      type: ITransactionType.erc20,
      tokenAddress: createdLogDao.tokenAddress,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findExistingLog with actionIndex', async () => {
    const nativeTx = {
      ...rawTransaction,
      tokenAddress: '0x0000000000000000000000000000000000000000',
      actionIndex: 5,
    }
    const createdTx = await Models.Transaction.create(nativeTx)
    const foundTx = await Models.Transaction.findExistingLog({
      transactionHash: createdTx.transactionHash,
      network: createdTx.network,
      daoAddress: createdTx.daoAddress,
      type: ITransactionType.native,
      actionIndex: 5,
    })
    expect(foundTx?.id).to.eq(createdTx.id)
    expect(foundTx?.actionIndex).to.eq(5)
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
          network: NetworksEnum.ethereumMainnet,
          side: ITransactionSide.deposit,
          type: ITransactionType.native,
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
          network: NetworksEnum.ethereumMainnet,
          side: ITransactionSide.deposit,
          type: ITransactionType.native,
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

    it('should filter by transaction side (deposit)', async () => {
      // Create transactions with different sides
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xdeposit1',
        side: ITransactionSide.deposit,
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xwithdraw1',
        side: ITransactionSide.withdraw,
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: { side: ITransactionSide.deposit },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.side).to.eq(ITransactionSide.deposit)
      })
    })

    it('should filter by transaction side (withdraw)', async () => {
      // Create transactions with different sides
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xdeposit2',
        side: ITransactionSide.deposit,
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xwithdraw2',
        side: ITransactionSide.withdraw,
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: { side: ITransactionSide.withdraw },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.side).to.eq(ITransactionSide.withdraw)
      })
    })

    it('should filter by transaction type (erc20)', async () => {
      // Create transactions with different types
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xerc20tx',
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken1',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xnativetx',
        type: ITransactionType.native,
        tokenAddress: '0x0000000000000000000000000000000000000000',
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: { type: ITransactionType.erc20 },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.type).to.eq(ITransactionType.erc20)
      })
    })

    it('should filter by transaction type (erc721)', async () => {
      // Create transactions with different types
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xerc721tx',
        type: ITransactionType.erc721,
        tokenId: '123',
        tokenAddress: '0xnft1',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xerc20tx2',
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken2',
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: { type: ITransactionType.erc721 },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.type).to.eq(ITransactionType.erc721)
      })
    })

    it('should filter by transaction type (native)', async () => {
      // Create transactions with different types
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xnativetx2',
        type: ITransactionType.native,
        tokenAddress: '0x0000000000000000000000000000000000000000',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xerc20tx3',
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken3',
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: { type: ITransactionType.native },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.type).to.eq(ITransactionType.native)
      })
    })

    it('should filter by both side and type', async () => {
      // Create transactions with different combinations
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xdepositErc20',
        side: ITransactionSide.deposit,
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken4',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xwithdrawErc20',
        side: ITransactionSide.withdraw,
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken5',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xdepositNative',
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        tokenAddress: '0x0000000000000000000000000000000000000000',
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: {
          side: ITransactionSide.deposit,
          type: ITransactionType.erc20,
        },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.side).to.eq(ITransactionSide.deposit)
        expect(tx.type).to.eq(ITransactionType.erc20)
      })
    })

    it('should filter by side, type, and daoAddress together', async () => {
      const specificDao = '0xdaoSpecific'

      // Create transactions with different combinations
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xspecificMatch',
        daoAddress: specificDao,
        side: ITransactionSide.withdraw,
        type: ITransactionType.erc721,
        tokenId: '456',
        tokenAddress: '0xnft2',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xwrongDao',
        daoAddress: '0xotherDao',
        side: ITransactionSide.withdraw,
        type: ITransactionType.erc721,
        tokenId: '789',
        tokenAddress: '0xnft3',
      })
      await Models.Transaction.create({
        ...rawTransaction,
        transactionHash: '0xwrongType',
        daoAddress: specificDao,
        side: ITransactionSide.withdraw,
        type: ITransactionType.erc20,
        tokenAddress: '0xtoken6',
      })

      const {
        data,
        metadata: { totalRecords },
      } = await Models.Transaction.findWithPagination({
        extraParams: {
          daoAddress: specificDao,
          side: ITransactionSide.withdraw,
          type: ITransactionType.erc721,
        },
        paginationParams: {},
      })

      expect(data.length).to.be.greaterThan(0)
      data.forEach(tx => {
        expect(tx.daoAddress).to.eq(specificDao)
        expect(tx.side).to.eq(ITransactionSide.withdraw)
        expect(tx.type).to.eq(ITransactionType.erc721)
      })
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
    expect(Object.keys(filterDao).length).to.eq(19)
  })

  it('Should filterKeys without token', async () => {
    const createdWithoutToken = await Models.Transaction.create({ ...rawTransaction, ...{ token: undefined } })
    const withoutToken = createdWithoutToken.filterKeys()
    expect(withoutToken.token).to.be.undefined
  })
})
