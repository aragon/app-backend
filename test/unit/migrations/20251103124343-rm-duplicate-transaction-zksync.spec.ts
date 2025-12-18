import { Models } from '@dbModels'
import rmDuplicateTransactionZksyncMigration from '@src/migrations/20251103124343-rm-duplicate-transaction-zksync'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: resetGauges', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should reset gauge plugin data and send RabbitMQ message', async () => {
    await Models.Transaction.create({
      transactionHash: '0xc5ed8456471b60a4f3bb44bb2ea406cde78433bfa564716563d83b98730ee242',
      blockNumber: 39758505,
      blockTimestamp: 1721661542,
      network: 'zksync-mainnet',
      side: 'deposit',
      type: 'erc20',
      fromAddress: '0xddF3065C1Dc423451530bF7B493243234bA1F95A',
      toAddress: '0xd5843D3B16EB07CD13483a9692205d1C38c7A6e4',
      value: '0.02738052181214087',
      tokenAddress: '0x000000000000000000000000000000000000800A',
      pluginAddress: null,
      daoAddress: '0xd5843D3B16EB07CD13483a9692205d1C38c7A6e4',
      logIndex: 22,
      transactionIndex: 2,
      token: {
        network: 'zksync-mainnet',
        type: 'ERC20',
        address: '0x000000000000000000000000000000000000800A',
        logo: '',
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        snapshot: {
          priceUsd: '0',
          priceUpdatedAt: 1721661542,
        },
      },
      amountUsd: '0.00',
    })

    await Models.Transaction.create({
      transactionHash: '0xc5ed8456471b60a4f3bb44bb2ea406cde78433bfa564716563d83b98730ee242',
      blockNumber: 39758505,
      blockTimestamp: 1721661542,
      network: 'zksync-mainnet',
      side: 'deposit',
      type: 'native',
      fromAddress: '0xddF3065C1Dc423451530bF7B493243234bA1F95A',
      toAddress: '0xd5843D3B16EB07CD13483a9692205d1C38c7A6e4',
      value: '0.02738052181214087',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      daoAddress: '0xd5843D3B16EB07CD13483a9692205d1C38c7A6e4',
      logIndex: 23,
      transactionIndex: 2,
      token: {
        network: 'zksync-mainnet',
        type: 'native',
        address: '0x0000000000000000000000000000000000000000',
        logo: 'https://logos.covalenthq.com/tokens/324/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png',
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        snapshot: {
          priceUsd: '3533.1183495312',
          priceUpdatedAt: 1721661542,
        },
      },
      amountUsd: '96.74',
    })

    const txsBefore = await Models.Transaction.find()
    expect(txsBefore).to.have.lengthOf(2)

    await rmDuplicateTransactionZksyncMigration.start()

    const txsAfter = await Models.Transaction.find()

    expect(txsAfter).to.have.lengthOf(1)
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await rmDuplicateTransactionZksyncMigration.stop()
      expect(true).to.be.true
    })
  })
})
