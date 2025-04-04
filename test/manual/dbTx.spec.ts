import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { ITokenType, ITransactionType, NetworksEnum } from '@types'
import utils from '@helpers/utils'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'
import type Dao from '@models/schema/dao'
import { expect } from 'chai'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import Web3Utils from '@helpers/web3Utils'

describe('Manual: DbTx', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should correctly increase balance in parallel and sum updates', async () => {
    const initialData = {
      network: NetworksEnum.ethereumMainnet,
      address: utils.zeroAddress,
      tokenAddress: utils.zeroAddress,
      amount: 0,
      votingPower: 0,
    }

    let balanceDb = await Models.MemberBalance.create(initialData)

    const balanceToIncrease = [
      { amount: 1, blockNumber: 0 },
      { amount: 2, blockNumber: 1 },
      { amount: 3, blockNumber: 2 },
    ]

    await Promise.all(
      balanceToIncrease.map(async ({ amount, blockNumber }) => {
        return DbTx.executeTxFn(async ({ session }) => {
          balanceDb = await Models.MemberBalance.findById(balanceDb._id, null, { session })
          await balanceDb.increaseBalance({ amount, blockNumber }, { session })
        })
      }),
    )

    const updatedBalance = await Models.MemberBalance.findById(balanceDb._id)

    expect(updatedBalance).to.exist
    expect(updatedBalance.amount).to.equal('6') // 1 + 2 + 3
  })

  it('should test DbTx in parallel', async () => {
    const tx = fakeAlchemyTransfer[1] as any

    const daoRegistry: Partial<Dao> = {
      id: 'daoRegistryId',
      address: tx.to,
      network: NetworksEnum.ethereumMainnet,
    }

    const expectedTransaction = {
      transactionHash: tx.hash,
      blockNumber: parseInt(tx.blockNum, 16),
      network: daoRegistry.network,
      type: ITransactionType.deposit,
      daoAddress: daoRegistry.address,
      fromAddress: tx.from,
      toAddress: tx.to,
      value: tx.value.toString(),
      tokenId: tx.tokenId,
      erc721TokenId: tx.erc721TokenId,
      erc1155Metadata: tx.erc1155Metadata,
      tokenAddress: utils.zeroAddress,
      category: tx.category,

      token: {
        type: ITokenType.ERC20,
        address: utils.zeroAddress,
        logo: null,
        name: 'Sepolia Avalanche',
        symbol: 'SAVL',
        decimals: 18,
      },
    }

    const fakeLogs = [
      {
        address: daoRegistry.address,
        data: '0x01',
        topics: ['0x01', 1, '0x01', '0x01'],
      },
    ]

    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(expectedTransaction.token as any)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
    sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
    sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: fakeLogs } as any)
    sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)

    const [result1, result2, result3] = (await Promise.all([
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
    ])) as any

    expect(result1).to.exist
    expect(result2).to.exist
    expect(result3).to.exist
  })
})
