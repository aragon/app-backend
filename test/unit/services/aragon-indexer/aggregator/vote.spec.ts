import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorVote } from '@services/aragon-indexer/aggregator/vote'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { ITokenType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

describe('Indexer:Aggregator:Vote', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorVote', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorVote.start()

      expect(stubLogger.calledWith('End AggregatorVote' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorVote', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorVote.start()

      expect(stubLogger.calledWith('End AggregatorVote' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should call onDocument', async () => {
    const document = {
      network: NetworksEnum.ethereumSepolia,
      transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd22d',
      daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3804',
      pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D2F',
      memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
      proposalId: 3,
      voteOption: 2,
      votingPower: '4000000000000000000',
      blockNumber: 4879275,
      token: {
        network: NetworksEnum.ethereumSepolia,
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        type: ITokenType.GovernanceERC20,
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x3949f15155d4b85d0159ab79cbf38dc51c41dd9f.png',
        name: 'T5673',
        decimals: 18,
        symbol: 'T5673',
      },
    }

    const stubLogger = sandbox.stub(Logger, 'verbose')
    const stubBlock = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

    await AggregatorVote.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true
    expect(stubBlock.calledOnceWith(document.blockNumber, document.network)).to.be.true

    const vote = await Models.Vote.findExistingLog({
      network: document.network,
      transactionHash: document.transactionHash,
      pluginAddress: document.pluginAddress,
      proposalId: document.proposalId,
    } as any)

    expect(vote.id).to.exist
    expect(vote.network).to.eq(document.network)
    expect(vote.blockNumber).to.eq(document.blockNumber)
    expect(vote.blockTimestamp).to.eq(100)
    expect(vote.transactionHash).to.eq(document.transactionHash)
    expect(vote.daoAddress).to.eq(document.daoAddress)
    expect(vote.pluginAddress).to.eq(document.pluginAddress)
    expect(vote.memberAddress).to.eq(document.memberAddress)
    expect(vote.proposalId).to.eq(document.proposalId)
    expect(vote.voteOption).to.eq(document.voteOption)
    expect(vote.votingPower).to.eq(document.votingPower)
    expect(vote.token.address).to.eq(document.token.address)
    expect(vote.token.symbol).to.eq(document.token.symbol)
    expect(vote.token.name).to.eq(document.token.name)
  })

  it('should update an existing aggregate vote log', async () => {
    const rawDoc: any = {
      network: NetworksEnum.ethereumSepolia,
      transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd22d',
      daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3804',
      pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D2F',
      memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
      proposalId: 3,
      voteOption: 2,
      votingPower: '4000000000000000000',
      blockNumber: 4879275,
      token: {
        network: NetworksEnum.ethereumSepolia,
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        type: ITokenType.GovernanceERC20,
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x3949f15155d4b85d0159ab79cbf38dc51c41dd9f.png',
        name: 'T5673',
        decimals: 18,
        symbol: 'T5673',
      },
    }
    const dbDoc = await Models.Vote.create(rawDoc)
    const loggerSpy = sandbox.stub(Logger, 'verbose')
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

    rawDoc.voteOption = 3
    await AggregatorVote.onDocument(rawDoc)

    const updatedDoc = await dbDoc.reload()

    expect(updatedDoc.voteOption).to.equal(3)
    expect(loggerSpy.calledOnceWith('Update Aggregate Vote' as any)).to.be.true
  })

  it('should query', () => {
    const pipeline = AggregatorVote.query([])
    expect(pipeline.length).to.eq(7)
  })
})
