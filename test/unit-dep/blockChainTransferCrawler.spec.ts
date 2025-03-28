import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import TokenUtils from '@helpers/tokenUtils'
import { RateModule } from '@modules/rates'
import { expect } from 'chai'
import logger from '@logger'
import { AlchemyProvider } from '@providers/assetTransafersProvider/alchemyProvider'

describe('Blockchain Transfer Log Crawler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should simulate the transaction crawler of a dao', async function () {
    this.timeout(123213123)
    const daoAddress = '0x86380e136A3AaD5677A210Ad02713694c4E6a5b9'
    const network = NetworksEnum.ethereumMainnet

    const daoDb = await Models.Dao.create({
      id: 'ethereum-mainnet-0x86380e136A3AaD5677A210Ad02713694c4E6a5b9',
      isActive: true,
      isHidden: false,
      network: 'ethereum-mainnet',
      transactionHash: '0xd72493df2dc55e46c1c46019267e149a0002219c7ed6cfbe181d989eee145676',
      blockNumber: 20161063,
      blockTimestamp: 1719226307,
      address: '0x86380e136A3AaD5677A210Ad02713694c4E6a5b9',
      implementationAddress: '0x52Af16664155608b845BE18aa29620EbF6eA2D3a',
      creatorAddress: '0x32bdc6A4e8C654dF65503CBb0eDc82B4Ce9158e6',
      ens: null,
      subdomain: 'polygoncommunitytreasury',
      metadataIpfs: 'ipfs://bafkreicecco73irw4m2olpwbw3rff3qpljuled6iw33jwl4htv7yqe4txe',
      name: 'Polygon Community Treasury',
      description:
        'The Polygon Community Treasury is a protocol-funded support mechanism, dedicated to ensuring the longevity and flourishing of the decentralized Polygon network and its ecosystem.\n\nFor more resources on Community Treasury governance, please refer to the Polygon Funding Proposals repository.',
      avatar: 'ipfs://QmXj8BtBp5wddCXcDQEAdBgkNtEjEHdHfHGsz4MnUBzxHU',
      version: '1.3.0',
      metrics: {
        tvlUSD: 15468709.96,
        proposalsCreated: 23,
        proposalsExecuted: 23,
        uniqueVoters: 2,
        votes: 46,
        members: 2,
      },
      links: [
        {
          name: 'PFP Repository',
          url: 'https://github.com/0xPolygon/Polygon-Funding-Proposals',
        },
      ],
    })

    sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
    sandbox.stub(RateModule, 'fetchRate').resolves({
      priceUsd: '1.2',
    } as any)

    sandbox
      .stub(BlockchainTransferCrawler.prototype, 'getBlockNumber')
      .onCall(0)
      .resolves(21872034)
      .onCall(1)
      .resolves(21872036)
      .onCall(2)
      .resolves(21872034)
      .onCall(3)
      .resolves(21872036)

    sandbox.stub(logger, 'verbose')

    await AlchemyProvider.getAssetTransfers(daoDb, DaoTransactions.saveTransaction)

    const txs = await Models.Transaction.find({ daoAddress: daoAddress, network })
    expect(txs).to.have.length(15)
  })
})
