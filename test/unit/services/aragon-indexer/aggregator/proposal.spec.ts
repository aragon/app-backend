import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorProposal } from '@services/aragon-indexer/aggregator/proposal'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import Logger from '@logger'
import DecodeActions from '@helpers/decodeAction'
import Web3Helper from '@helpers/web3'
import { ethers } from 'ethers'
import CovalentHelper from '@helpers/covalent'
import { ProxyToken } from '@modules/proxyToken'
import LogProposalMetadata from '@models/schema/logProposalMetadata'
import LogProposal from '@models/schema/logProposal'
import Plugin from '@models/schema/plugin'
import Covalent from '@helpers/covalent'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { ProxyMember } from '@modules/proxyMember'

describe('Indexer:Aggregator:Proposal', () => {
  let sandbox: SinonSandbox
  let rawLogProposalMetadata: Partial<LogProposalMetadata>
  let rawLogProposal: Partial<LogProposal>
  let rawPlugin: Partial<Plugin>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogProposalMetadata = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
      fetchedMetadata: true,
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      proposalId: 1,
      metadataUri: 'test-uri',
      title: 'some-title',
      summary: 'some-summary',
      description: 'some-description',
      resources: [],
      media: {
        header: 'some-header',
        logo: 'some-logo',
      },
    }

    rawLogProposal = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      proposalId: 1,
      allowFailureMap: 0,
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
      startDate: 234234223,
      endDate: 334234223,
      metadataUri: 'some-uri',
      actions: [
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          value: '0',
          data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
        },
      ],
      executed: {
        status: true,
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
      },
    }

    rawPlugin = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5402',
      tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5403',
      pluginSetupRepoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
      sender: '0x17366cae2b9c6c3055e9e3c78936a69006be5405',
      release: '1',
      build: '2',
      subdomain: 'dao.eth',
    }
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('createProposal', async () => {
    it('should createProposal', async () => {
      const plugin = await Models.Plugin.create(rawPlugin)

      // const parsedActions = [
      //   {
      //     to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
      //     data: '0x',
      //     value: '0',
      //     functionName: 'test',
      //     textSignature: 'test(uint256,uint256)',
      //     decoded: ['1', 1],
      //     contractName: null,
      //   },
      // ]
      // const _fetchTokenDetailsStub = sandbox.stub(AggregatorProposal, '_fetchTokenDetails').resolves({
      //   address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      //   name: 'MockToken',
      //   type: ITokenType.ERC20,
      // })

      const stubParseActions = sandbox.stub(AggregatorProposal, '_parseActions').resolves(parsedActions)
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const spyGetMember = sandbox.spy(ProxyMember, 'saveAndGetMember')
      const spyGetToken = sandbox.spy(ProxyToken, 'saveAndGetToken')
      const stubCovalent = sandbox.stub(Covalent, 'getTokenInfo').resolves({
        totalHolders: 2,
      } as any)
      const stubTotalSupply = sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves('100')

      const newProposal = await AggregatorProposal.createProposal({
        logProposal: rawLogProposal,
        logProposalMetadata: rawLogProposalMetadata,
      })

      expect(stubParseActions.calledOnce).to.be.true
      // expect(_getProposalMetricsStub.calledOnce).to.be.true
      expect(spyGetMember.calledOnceWith(rawLogProposal.creatorAddress)).to.be.true
      expect(spyGetToken.calledOnceWith(plugin.tokenAddress, plugin.network)).to.be.true
      expect(stubTotalSupply.calledOnceWith(plugin.tokenAddress, plugin.network)).to.be.true
      expect(stubCovalent.calledOnceWith(plugin.tokenAddress, plugin.network, plugin.blockNumber)).to.be.true
      expect(stubLogger.calledWith('New Aggregate Proposal' as any)).to.be.true

      expect(newProposal.id).to.exist
      expect(newProposal.transactionHash).to.eq(document.transactionHash)
      expect(newProposal.blockNumber).to.eq(document.blockNumber)
      expect(newProposal.network).to.eq(document.network)
      expect(newProposal.pluginAddress).to.eq(document.pluginAddress)
      expect(newProposal.proposalId).to.eq(document.proposalId)
      expect(newProposal.creatorAddress).to.eq(document.creatorAddress)
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

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenInfo').resolves({
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
      })

      const actions = await AggregatorProposal.parseActions(logActions, document)

      expect(covalentStub.calledOnce).to.be.true

      expect(actions).to.deep.equal([
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          value: '0',
          data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
          inputData: {
            function: 'mint',
            notice: 'Mints tokens to an address.',
            contract: 'GovernanceERC20',
            parameters: [
              {
                name: 'to',
                notice: 'The address receiving the tokens.',
                type: 'address',
                value: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
              },
              {
                name: 'amount',
                notice: 'The amount of tokens to be minted.',
                type: 'uint256',
                value: '1000000000000000000',
              },
            ],
            textSignature: 'mint(address,uint256)',
          },
          type: 'Mint',
          receivers: {
            address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
            currentBalance: '0',
            newBalance: '1000000000000000000',
          },
          totalSupply: '1000000000000000000000',
          holdersCount: 1,
          token: {
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            priceUsd: undefined,
            logo: 'https://mock.com/logo.png',
            address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
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
          from: '0x0dao',
          type: 'Transfer',
          sender: {
            address: '0x0dao',
          },
          receiver: {
            address: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          },
          amount: '424000000000000',
          token: {
            address: '0x0000000000000000000000000000000000000000',
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            logo: 'https://mock.com/logo.png',
            type: 'native',
          },
          inputData: {
            textSignature: 'nativeTransfer(address,uint256)',
            function: 'NativeTransfer',
            contract: 'NativeToken',
            parameters: [
              {
                type: 'address',
                value: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
              },
              {
                type: 'uint256',
                value: '424000000000000',
              },
            ],
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
    const pipeline = AggregatorProposal.query([NetworksEnum.ethereumMainnet], { skip: 0, limit: 10 })
    expect(pipeline.length).to.equal(17)
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

      const getTotalSupplyStub = sandbox.stub(CovalentHelper, 'getTokenTotalSupply').resolves('1000000000000000000000')
      const getTokenDetailStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(token as any)
      const findExistingStub = sandbox.stub(Models.Proposal, 'findByTransactionHash').resolves({
        aa: 'aa',
      })
      const tokenDetails = await AggregatorProposal._fetchTokenDetails({
        transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
        tokenAddress,
        network,
        blockHeight: 16733707,
      } as any)

      expect(getTotalSupplyStub.calledOnce).to.be.true
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
