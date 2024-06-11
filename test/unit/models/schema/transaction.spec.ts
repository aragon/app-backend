import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'

describe('Model: Transaction', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTransaction = {
      transactionHash: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      blockNumber: 1,
      network: NetworksEnum.mainnet,
      type: ITransactionType.deposit,
      category: ITransactionCategory.Internal,
      fromAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc0',
      toAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
      value: '0x0',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc9',
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
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Transaction', async () => {
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
    expect(createdToken.tokenId).to.eq(rawTransaction.tokenId)
    expect(createdToken.erc721TokenId).to.eq(rawTransaction.erc721TokenId)
    expect(createdToken.erc1155Metadata[0].tokenId).to.eq(rawTransaction.erc1155Metadata?.[0].tokenId)
    expect(createdToken.erc1155Metadata[0].value).to.eq(rawTransaction.erc1155Metadata?.[0].value)
    expect(createdToken.proposalId).to.eq(rawTransaction.proposalId)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const category = ITransactionCategory.ERC20
    const network = NetworksEnum.mainnet
    const entityId = await Models.Transaction.getEntityId(transactionHash, category, network)
    expect(entityId).to.eq(`${transactionHash}-${category}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Transaction.create(rawTransaction)
    const foundLogDao = await Models.Transaction.findExistingLog(
      createdLogDao.transactionHash,
      createdLogDao.category,
      createdLogDao.network,
    )
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Transaction.create(rawTransaction)
    const foundLogDao = await Models.Transaction.findByEntityId(createdLogDao.entityId)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
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
})
