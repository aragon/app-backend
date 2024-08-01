import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorProposal } from '@services/aragon-indexer/aggregator/proposal'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { ITokenType, NetworksEnum, ProposalActionType } from '@types'
import Logger from '@logger'
import DecodeActions from '@helpers/decodeActions'
import Web3Helper from '@helpers/web3'
import { UtilsIndexer } from '@indexer/utils/indexer'
import { ethers } from 'ethers'
import CovalentHelper from '@helpers/covalent'

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
        tokenAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
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
        actions: [],
        description:
          '<p>Changing the following metadata on the DAO:<br><strong>Name - Feel the Breeze</strong></p><p><strong>Logo</strong></p>',
        summary: 'Changing DAO metadata',
        media: {
          header: 'test',
          logo: 'test-logo',
        },
      }

      const parsedActions = [
        {
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          data: '0x',
          value: '0',
          functionName: 'test',
          textSignature: 'test(uint256,uint256)',
          decoded: ['1', 1],
          contractName: null,
        },
      ]
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubGetBlockTime = sandbox.stub(Web3Helper, 'getBlockTimestamp')
      const stubParseActions = sandbox.stub(AggregatorProposal, 'parseActions').resolves(parsedActions)
      const _getProposalMetricsStub = sandbox.stub(AggregatorProposal, '_getProposalMetrics').resolves({
        totalVotes: 0,
      })
      const _fetchTokenDetailsStub = sandbox.stub(AggregatorProposal, '_fetchTokenDetails').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        type: ITokenType.ERC20,
      })
      await AggregatorProposal.onDocument(document as any)

      expect(stubLogger.calledWith('New Aggregate Proposal' as any)).to.be.true

      const member = await Models.Proposal.findExistingLog({
        transactionHash: document.transactionHash,
        pluginAddress: document.pluginAddress,
        proposalId: document.proposalId,
      })
      expect(_getProposalMetricsStub.calledOnce).to.be.false
      expect(stubGetBlockTime.calledTwice).to.be.true
      expect(stubParseActions.calledOnce).to.be.true
      expect(_fetchTokenDetailsStub.calledOnce).to.be.true

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
      expect(member.tokenAddress).to.be.eq(undefined)
      expect(member.token.address).to.be.eq(document.tokenAddress)
      expect(member.settings?.votingMode).to.eq(document.settings?.votingMode)
      expect(member.settings?.supportThreshold).to.eq(document.settings?.supportThreshold)
      expect(member.settings?.minParticipation).to.eq(document.settings?.minParticipation)
      expect(member.settings?.minDuration).to.eq(document.settings?.minDuration)
      expect(member.settings?.minProposerVotingPower).to.eq(document.settings?.minProposerVotingPower)
      expect(member.settings.fromBlockNumber).to.eq(document.settings?.fromBlockNumber)
      expect(member.settings.toBlockNumber).to.eq(document.settings?.toBlockNumber)
      expect(member.settings.fromTxHash).to.eq(document.settings?.fromTxHash)
      expect(member.settings.toTxHash).to.eq(document.settings?.toTxHash)
      expect(member.actions[0].to).to.eq(parsedActions[0].to)
      expect(member.actions[0].data).to.eq(parsedActions[0].data)
      expect(member.actions[0].value).to.eq(parsedActions[0].value)
      expect(member.actions[0].functionName).to.eq(parsedActions[0].functionName)
      expect(member.actions[0].textSignature).to.eq(parsedActions[0].textSignature)
      expect(member.actions[0].contractName).to.eq(parsedActions[0].contractName)
      expect(member.actions[0].decoded[0]).to.eq(parsedActions[0].decoded[0])
      expect(member.actions[0].decoded[1]).to.eq(parsedActions[0].decoded[1])
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
        actions: [],
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
      const stubGetBlockTime = sandbox.stub(Web3Helper, 'getBlockTimestamp')
      const _getProposalMetricsStub = sandbox.stub(AggregatorProposal, '_getProposalMetrics').resolves({
        totalVotes: 0,
      })

      document.title = 'test title'
      await AggregatorProposal.onDocument(document as any)

      expect(stubLogger.calledWith('Update Aggregate Proposal' as any)).to.be.true

      const member = await Models.Proposal.findExistingLog({
        transactionHash: document.transactionHash,
        pluginAddress: document.pluginAddress,
        proposalId: document.proposalId,
      })

      expect(_getProposalMetricsStub.calledOnce).to.be.true
      expect(stubGetBlockTime.calledTwice).to.be.true
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

  describe('parseActions', () => {
    it('should parse actions correctly', async () => {
      const document = { daoAddress: '0x0dao', to: '0x', value: '0' }
      const logActions = [
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          value: '0',
          data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
        },
      ]

      sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const actions = await AggregatorProposal.parseActions(logActions, document)

      expect(actions).to.deep.equal([
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          value: '0',
          data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
          functionName: 'mint',
          textSignature: 'mint(address,uint256)',
          decoded: ['0x284803C34A3F049f787E2562e6F8C084bdBC3197', 1000000000000000000n],
          contractName: 'IERC20MintableUpgradeable',
          type: ProposalActionType.Mint,
          metadata: {
            token: {
              address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
              name: 'MockToken',
              symbol: 'MOCK',
              decimals: 18,
              logo: 'https://mock.com/logo.png',
              type: 'ERC20',
            },
            to: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
            value: 1000000000000000000n,
          },
        },
      ])
    })

    it('should return empty array if no actions are provided', async () => {
      const logActions: any[] = []
      const document = { daoAddress: '0x0dao', to: '0x', value: '0' }
      const actions = await AggregatorProposal.parseActions(logActions, document)
      expect(actions).to.deep.equal([])
    })

    it('should handle actions native transfer', async () => {
      const logActions = [
        {
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          value: '424000000000000',
          data: '0x',
        },
      ]

      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        address: ethers.ZeroAddress,
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: ITokenType.native,
      } as any)

      const document = { daoAddress: '0x0dao', to: '0x', value: '0' }
      const actions = await AggregatorProposal.parseActions(logActions, document)

      expect(actions).to.deep.equal([
        {
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          value: '424000000000000',
          data: '0x',
          functionName: 'NativeTransfer',
          textSignature: 'nativeTransfer(address,address,uint256)',
          decoded: ['0x0dao', '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31', '424000000000000'],
          type: ProposalActionType.Transfer,
          metadata: {
            from: '0x0dao',
            to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
            value: '424000000000000',
            token: {
              address: ethers.ZeroAddress,
              name: 'MockToken',
              symbol: 'MOCK',
              decimals: 18,
              logo: 'https://mock.com/logo.png',
              type: ITokenType.native,
            },
          },
        },
      ])
    })

    it('should return action unchanged if decoding fails', async () => {
      const document = { daoAddress: '0x0dao', to: '0x', value: '0' }
      const logActions = [
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          value: '0',
          data: '0x00e10f10000000000000000000000000',
        },
      ]

      const decodeActions = new DecodeActions()
      sandbox.stub(decodeActions, 'decodeData').resolves(null)

      const actions = await AggregatorProposal.parseActions(logActions, document)

      expect(actions).to.deep.equal(logActions)
    })
  })

  it('should use default date when none is provided', () => {
    const pipeline = AggregatorProposal.query([])
    expect(pipeline.length).to.equal(14)
  })

  it('should _getProposalMetrics', async () => {
    const aggStub = sandbox.stub(Models.LogProposal, 'aggregate').resolves([])
    await AggregatorProposal._getProposalMetrics(0, '0x0dao')

    expect(aggStub.calledOnce).to.be.true
    expect(aggStub.args[0][0].length).to.deep.eq(4)
  })

  describe('_fetchTokenDetails', () => {
    it('should _fetchTokenDetails when token details are not saved', async () => {
      const tokenAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: ITokenType.ERC20,
      }

      const getTokenInfoCovalentStub = sandbox.stub(CovalentHelper, 'getTokenInfo').resolves({
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
      })
      const getTokenDetailStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves(token as any)
      const findExistingStub = sandbox.stub(Models.Proposal, 'findByTransactionHash').resolves({
        aa: 'aa',
      })
      const tokenDetails = await AggregatorProposal._fetchTokenDetails({
        transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
        tokenAddress,
        network,
        blockHeight: 16733707,
      } as any)
      expect(getTokenInfoCovalentStub.calledOnce).to.be.true
      expect(getTokenDetailStub.calledOnce).to.be.true
      expect(findExistingStub.calledOnce).to.be.true
      expect(tokenDetails).to.deep.eq({
        ...token,
        totalSupply: '1000000000000000000000',
      })
    })

    it('should _fetchTokenDetails when token details are saved', async () => {
      const findExistingStub = sandbox.stub(Models.Proposal, 'findByTransactionHash').resolves({
        token: {
          address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          name: 'MockToken',
          symbol: 'MOCK',
          decimals: 18,
          logo: 'https://mock.com/logo.png',
          type: ITokenType.ERC20,
        },
      })

      const getTotalSupplyStub = sandbox.stub(CovalentHelper, 'getTokenTotalSupply')

      const tokenDetails = await AggregatorProposal._fetchTokenDetails({
        transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
        tokenAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        network: NetworksEnum.ethereumMainnet,
        blockHeight: 16733707,
      })

      expect(getTotalSupplyStub.calledOnce).to.be.false
      expect(findExistingStub.calledOnce).to.be.true
      expect(tokenDetails.address).to.eq('0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F')
    })
  })
})
