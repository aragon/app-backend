import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorProposal } from '@services/aragon-indexer/aggregator/proposal'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { NetworksEnum } from '@types'
import Logger from '@logger'

describe('Indexer:Aggregator:Proposal', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorProposal', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorProposal.start()

      expect(stubLogger.calledWith('End AggregatorProposal' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorProposal', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorProposal.start()

      expect(stubLogger.calledWith('End AggregatorProposal' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', async () => {
    it('should call onDocument', async () => {
      const document = {
        transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
        blockNumber: 16733645,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xB85380977eC3435aeBc13e29b01AF990393bdED9',
        proposalId: 0,
        creatorAddress: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
        startDate: 1677672720,
        endDate: 1677676920,
        metadataUri: 'ipfs://QmVgY3QEEDypzjW8Udj1LECNDZTDNYkNZ5VNKTPYff1Vwz',
        executed: {
          status: true,
          transactionHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
          blockNumber: 16733707,
        },
        settings: {
          votingMode: 1,
          supportThreshold: 500000,
          minParticipation: 150000,
          minDuration: 3600,
          minProposerVotingPower: '5e+19',
          fromBlockNumber: 16726558,
          toBlockNumber: 16733707,
          fromTxHash: '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
          toTxHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
        },
        daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
        title: 'New Look!',
        description:
          '<p>Changing the following metadata on the DAO:<br><strong>Name - Feel the Breeze</strong></p><p><strong>Logo</strong></p>',
        summary: 'Changing DAO metadata',
        media: {
          header: 'test',
          logo: 'test-logo',
        },
      }

      const stubLogger = sandbox.stub(Logger, 'verbose')

      await AggregatorProposal.onDocument(document as any)

      expect(stubLogger.calledWith('New Aggregate Proposal' as any)).to.be.true

      const member = await Models.Proposal.findExistingLog({
        transactionHash: document.transactionHash,
        pluginAddress: document.pluginAddress,
        proposalId: document.proposalId,
      })

      expect(member.id).to.exist
      expect(member.transactionHash).to.eq(document.transactionHash)
      expect(member.blockNumber).to.eq(document.blockNumber)
      expect(member.network).to.eq(document.network)
      expect(member.pluginAddress).to.eq(document.pluginAddress)
      expect(member.proposalId).to.eq(document.proposalId)
      expect(member.creatorAddress).to.eq(document.creatorAddress)
      expect(member.startDate).to.eq(document.startDate)
      expect(member.endDate).to.eq(document.endDate)
      expect(member.metadataUri).to.eq(document.metadataUri)
      expect(member.settings?.votingMode).to.eq(document.settings?.votingMode)
      expect(member.settings?.supportThreshold).to.eq(document.settings?.supportThreshold)
      expect(member.settings?.minParticipation).to.eq(document.settings?.minParticipation)
      expect(member.settings?.minDuration).to.eq(document.settings?.minDuration)
      expect(member.settings?.minProposerVotingPower).to.eq(document.settings?.minProposerVotingPower)
      expect(member.settings.fromBlockNumber).to.eq(document.settings?.fromBlockNumber)
      expect(member.settings.toBlockNumber).to.eq(document.settings?.toBlockNumber)
      expect(member.settings.fromTxHash).to.eq(document.settings?.fromTxHash)
      expect(member.settings.toTxHash).to.eq(document.settings?.toTxHash)
      expect(member.daoAddress).to.eq(document.daoAddress)
      expect(member.title).to.eq(document.title)
      expect(member.description).to.eq(document.description)
      expect(member.summary).to.eq(document.summary)
      expect(member.media?.header).to.eq(document.media?.header)
      expect(member.media?.logo).to.eq(document.media?.logo)
      expect(member.executed?.status).to.eq(document.executed?.status)
      expect(member.executed?.transactionHash).to.eq(document.executed?.transactionHash)
      expect(member.executed?.blockNumber).to.eq(document.executed?.blockNumber)
    })

    it('should call update', async () => {
      const document = {
        transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
        blockNumber: 16733645,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xB85380977eC3435aeBc13e29b01AF990393bdED9',
        proposalId: 0,
        creatorAddress: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
        startDate: 1677672720,
        endDate: 1677676920,
        metadataUri: 'ipfs://QmVgY3QEEDypzjW8Udj1LECNDZTDNYkNZ5VNKTPYff1Vwz',
        executed: {
          status: true,
          transactionHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
          blockNumber: 16733707,
        },
        settings: {
          votingMode: 1,
          supportThreshold: 500000,
          minParticipation: 150000,
          minDuration: 3600,
          minProposerVotingPower: '5e+19',
          fromBlockNumber: 16726558,
          toBlockNumber: 16733707,
          fromTxHash: '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
          toTxHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
        },
        daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
        title: 'New Look!',
        description:
          '<p>Changing the following metadata on the DAO:<br><strong>Name - Feel the Breeze</strong></p><p><strong>Logo</strong></p>',
        summary: 'Changing DAO metadata',
        media: {
          header: 'test',
          logo: 'test-logo',
        },
      }

      await Models.Proposal.create(document)

      const stubLogger = sandbox.stub(Logger, 'verbose')

      document.title = 'test title'
      await AggregatorProposal.onDocument(document as any)

      expect(stubLogger.calledWith('Update Aggregate Proposal' as any)).to.be.true

      const member = await Models.Proposal.findExistingLog({
        transactionHash: document.transactionHash,
        pluginAddress: document.pluginAddress,
        proposalId: document.proposalId,
      })

      expect(member.id).to.exist
      expect(member.transactionHash).to.eq(document.transactionHash)
      expect(member.blockNumber).to.eq(document.blockNumber)
      expect(member.network).to.eq(document.network)
      expect(member.pluginAddress).to.eq(document.pluginAddress)
      expect(member.proposalId).to.eq(document.proposalId)
      expect(member.creatorAddress).to.eq(document.creatorAddress)
      expect(member.startDate).to.eq(document.startDate)
      expect(member.endDate).to.eq(document.endDate)
      expect(member.metadataUri).to.eq(document.metadataUri)
      expect(member.settings?.votingMode).to.eq(document.settings?.votingMode)
      expect(member.settings?.supportThreshold).to.eq(document.settings?.supportThreshold)
      expect(member.settings?.minParticipation).to.eq(document.settings?.minParticipation)
      expect(member.settings?.minDuration).to.eq(document.settings?.minDuration)
      expect(member.settings?.minProposerVotingPower).to.eq(document.settings?.minProposerVotingPower)
      expect(member.settings.fromBlockNumber).to.eq(document.settings?.fromBlockNumber)
      expect(member.settings.toBlockNumber).to.eq(document.settings?.toBlockNumber)
      expect(member.settings.fromTxHash).to.eq(document.settings?.fromTxHash)
      expect(member.settings.toTxHash).to.eq(document.settings?.toTxHash)
      expect(member.daoAddress).to.eq(document.daoAddress)
      expect(member.title).to.eq(document.title)
      expect(member.description).to.eq(document.description)
      expect(member.summary).to.eq(document.summary)
      expect(member.media?.header).to.eq(document.media?.header)
      expect(member.media?.logo).to.eq(document.media?.logo)
      expect(member.executed?.status).to.eq(document.executed?.status)
      expect(member.executed?.transactionHash).to.eq(document.executed?.transactionHash)
      expect(member.executed?.blockNumber).to.eq(document.executed?.blockNumber)
    })
  })

  it('should use default date when none is provided', () => {
    const pipeline = AggregatorProposal.query()
    expect(pipeline.length).to.equal(13)
  })
})
