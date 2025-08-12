import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { Models } from '@dbModels'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { ProposalHandler } from '@handlers/proposalHandler'
import { expect } from 'chai'
import { DAORegistry } from '@artifacts/daoRegistry'
import { SharedLogs } from '@artifacts/shared'

describe('Integration: Proposal', () => {
  let sandbox: SinonSandbox

  before(async () => {
    await UnitDepUtils.registerPluginRepos()
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('IncrementalId - chiliz', async function () {
    this.timeout(1600000)
    const transactionHash = '0xc2638b87e3ccadf69ab4fb581da033d5b1949a5c09eed0d018c2ecc2471c84ff'
    const network = NetworksEnum.cornMainnet

    await Models.Plugin.create({
      id: 'corn-mainnet-0xef4a512ba0836239143cc8a5a79cb0f8de68493aa04b5aff4df64d90c5abae3b-0x62217Ae59A8D1E19CA304f9C10AC0361F4542803',
      transactionHash: '0xef4a512ba0836239143cc8a5a79cb0f8de68493aa04b5aff4df64d90c5abae3b',
      blockNumber: 776138,
      blockTimestamp: 1753969887,
      network,
      address: '0x62217Ae59A8D1E19CA304f9C10AC0361F4542803',
      implementationAddress: '0x7ab3908D556578429e9300696DB55831f3700f04',
      interfaceType: 'multisig',
      status: 'installed',
      isSupported: true,
      daoAddress: '0xcf03B0739A285F613E716f9b9f83167525F0f06C',
      tokenAddress: null,
      pluginSetupRepoAddress: '0xf3793d55C5fef8AFB5CDF305996A93281C6Bd220',
      sender: '0xCFE83d0079c9455eF1e11864D701d6e1bDf8Ff2a',
      release: '1',
      build: '3',
      subdomain: 'multisig',
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: true,
      isSubPlugin: true,
      metadataIpfs: 'ipfs://Qmf8e9U1rts7dR7bTLFPhKa97rE31wBGKLWHRnJzuh6Rpr',
      name: 'MS',
      description: '',
      processKey: null,
      votingEscrow: null,
      subPlugins: [],
      links: [],
      parentPlugin: '0x12CB507bE69A179A18a659235009f782DFA32501',
      stageIndex: 0,
    })

    const proposalCreatedEvents = await UnitDepUtils.getData(
      SharedLogs.abi,
      'ProposalCreated',
      transactionHash,
      network,
    )

    console.log(proposalCreatedEvents)
    await ProposalHandler.proposalCreated(proposalCreatedEvents[0].event, proposalCreatedEvents[0].logInfo)

    console.log('ok')
  })

  it('proposalResultReport - update spp proposal on external body result', async function () {
    this.timeout(10000000)

    const network = NetworksEnum.ethereumSepolia
    const txHash = '0x3bd7bb1f7ae85868ffd9cf7eeeb74c499c1372349a138108f4c3591841aed3b4'

    const plugin = await Models.Plugin.create({
      id: 'ethereum-sepolia-0x36cc7b686c5fb0a2f5660d96c8a3094e8f79d6cc429744c78d665a100cf043a1-0x86313457a83Ad93e01a620Cd91A28808b2A048fc',
      transactionHash: '0x36cc7b686c5fb0a2f5660d96c8a3094e8f79d6cc429744c78d665a100cf043a1',
      blockNumber: 8185121,
      blockTimestamp: 1745487984,
      network: 'ethereum-sepolia',
      address: '0x86313457a83Ad93e01a620Cd91A28808b2A048fc',
      implementationAddress: '0x6C5C467c94bcc594DeE61CFa0e8cCa24d835d894',
      interfaceType: 'spp',
      status: 'installed',
      isSupported: true,
      daoAddress: '0xfd05BC8ec5774751F908A3b430F0c0D1382ad8b2',
      tokenAddress: null,
      pluginSetupRepoAddress: '0xda62D32C14E8CA78958d6fdC0142A575b0cd6Ad4',
      sender: '0x7a20760b89EF507759DD2c5A0d1f1657614341A9',
      release: '1',
      build: '1',
      subdomain: 'spp',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      hasTarget: false,
      isProcess: true,
      isBody: false,
      isSubPlugin: false,
      metadataIpfs: 'ipfs://QmWYfsDTpgtzF3w3Jc6Trvo1t1JhnPWEEmN58BStCKQHfb',
      name: 'External test',
      description: null,
      processKey: 'EXT',
      subPlugins: [
        {
          addresses: ['0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F', '0x45B7de03cbFc5163446557B2FF209a0aFfcbDC5E'],
          stageIndex: 0,
        },
      ],
      links: [],
      createdAt: '2025-04-24T09:46:29.103+0000',
      updatedAt: '2025-04-24T09:46:53.014+0000',
      totalStages: 1,
    })
    const proposal = await Models.Proposal.create({
      id: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f-0x86313457a83Ad93e01a620Cd91A28808b2A048fc-39086013580276791839085490461993454292970741380284618386117700367461939173604',
      transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
      blockNumber: 8185135,
      blockTimestamp: 1745488164,
      network,
      pluginAddress: '0x86313457a83Ad93e01a620Cd91A28808b2A048fc',
      pluginSubdomain: 'spp',
      daoAddress: '0xfd05BC8ec5774751F908A3b430F0c0D1382ad8b2',
      proposalIndex: '39086013580276791839085490461993454292970741380284618386117700367461939173604',
      incrementalId: 0,
      creatorAddress: '0x6818013d7B2D49D7396BA9733b59C539A639f3ED',
      startDate: 1745488164,
      endDate: 0,
      metadataUri: 'ipfs://QmUPJ1dXRT2WVXiKEeQrJdRVeiuGh1CVExzSs6SLjDGuR4',
      title: 'sdf',
      description: null,
      summary: 'sdf',
      resources: [],
      allowFailureMap: 0,
      executed: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      rawActions: [],
      actions: [],
      decoding: true,
      media: {
        header: null,
        logo: null,
      },
      settings: {
        id: '0x0342ff8d5894847e51e77844fdc08e3f18c483d41a3c7532eea26d62fdfae558-0x86313457a83Ad93e01a620Cd91A28808b2A048fc',
        transactionHash: '0x0342ff8d5894847e51e77844fdc08e3f18c483d41a3c7532eea26d62fdfae558',
        blockNumber: 8185122,
        blockTimestamp: 1745487996,
        network,
        daoAddress: '0xfd05BC8ec5774751F908A3b430F0c0D1382ad8b2',
        pluginAddress: '0x86313457a83Ad93e01a620Cd91A28808b2A048fc',
        pluginSubdomain: 'spp',
        tokenAddress: null,
        stages: [
          {
            stageIndex: 0,
            minAdvance: 604800,
            maxAdvance: 3155760000.0,
            voteDuration: 604800,
            approvalThreshold: 0,
            vetoThreshold: 1,
            plugins: [
              {
                address: '0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F',
                isManual: true,
                allowedBody: 'true',
                proposalType: 2,
              },
              {
                address: '0x45B7de03cbFc5163446557B2FF209a0aFfcbDC5E',
                isManual: false,
                allowedBody: 'true',
                proposalType: 2,
              },
            ],
            name: 'S1',
            cancelable: false,
            editable: false,
          },
        ],
      },
      metrics: {
        totalVotes: 0,
        missingVotes: 0,
        votesByOption: [],
      },
      isSubProposal: false,
      editedTxInfo: null,
      cancelTxInfo: false,
      subProposals: [
        {
          pluginAddress: '0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F',
          proposalIndex: '0',
          stageIndex: 0,
          transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
          blockNumber: 8185135,
        },
        {
          pluginAddress: '0x45B7de03cbFc5163446557B2FF209a0aFfcbDC5E',
          proposalIndex: '59638062734096546706360171231707009963581720596085250721272336933311096790965',
          stageIndex: 0,
          transactionHash: '0xb28a2e8a6bab79da7bd74ddad069ec31ba0200019b0ee31cc720496365e9df7f',
          blockNumber: 8185135,
        },
      ],
      stageExecutions: [],
      results: [],
      createdAt: '2025-04-24T09:49:33.498+0000',
      updatedAt: '2025-04-24T09:49:34.181+0000',
      lastStageTransition: 1745488164,
      stageIndex: 0,
      totalStages: 1,
    })

    const resultEvents = await UnitDepUtils.getData(
      StagedProposalProcessor.abi,
      'ProposalResultReported',
      txHash,
      NetworksEnum.ethereumSepolia,
    )

    for (const { event, logInfo } of resultEvents) {
      await ProposalHandler.proposalResultReport(event, logInfo)
    }

    const updatedProposal = await proposal.reload()
    expect(updatedProposal.results.length).to.eq(1)
    expect(updatedProposal.results[0].pluginAddress).to.eq('0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F')
    expect(updatedProposal.results[0].transactionHash).to.eq(txHash)
    expect(updatedProposal.results[0].blockNumber).to.eq(8186186)
    expect(updatedProposal.results[0].resultType).to.eq(2)
    expect(updatedProposal.results[0].stage).to.eq(0)
  })
})
