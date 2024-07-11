import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorEnsMember } from '@services/aragon-indexer/aggregator/ensMember'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import Member from '@models/schema/member'
import Web3Helper from '@helpers/web3'

describe('Indexer:Aggregator:EnsMember', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: [
        {
          name: 'leuts.eth',
          registrationDateTimestamp: 0,
          expiredDateTimestamp: 0,
        },
      ],
      history: [
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
          tokenBalance: '100',
          pluginSubdomain: 'token-voting',
          metrics: {
            delegateReceivedCount: 0,
            delegateSentCount: 0,
            voteCount: 0,
            proposalCount: 0,
          },
          fromBlockTimestamp: 0,
        },
      ],
    }
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorEnsMember', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorEnsMember.start()

      expect(stubLogger.calledWith('End AggregatorEnsMember' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorEnsMember', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorEnsMember.start()

      expect(stubLogger.calledWith('End AggregatorEnsMember' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should call onDocument', async () => {
    const document = await Models.Member.create(rawMember as any)

    const stubLogger = sandbox.stub(Logger, 'verbose')
    const stubEns = sandbox.stub(Web3Helper, 'getEnsWithAlchemy').resolves([
      { name: 'matrix.eth', registrationDateTimestamp: 1, expiredDateTimestamp: 1 },
      { name: 'matrix1.eth', registrationDateTimestamp: 0, expiredDateTimestamp: 0 },
    ])

    await AggregatorEnsMember.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true
    expect(stubEns.calledOnceWith(document.address)).to.be.true

    const member = await Models.Member.findExistingLog({ address: document.address })
    expect(member.address).to.equal(document.address)
    expect(member.ens.length).to.eq(2)
    expect(member.ens[0].name).to.eq('matrix.eth')
    expect(member.ens[0].registrationDateTimestamp).to.eq(1)
    expect(member.ens[0].expiredDateTimestamp).to.eq(1)
    expect(member.ens[1].name).to.eq('matrix1.eth')
    expect(member.ens[1].registrationDateTimestamp).to.eq(0)
    expect(member.ens[1].expiredDateTimestamp).to.eq(0)
  })
})
