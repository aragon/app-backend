import ProposalHelper from '@helpers/proposal'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: ProposalHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getBodyResult', async () => {
    const proposalIndex = '39086013580276791839085490461993454292970741380284618386117700367461939173604'
    const stage = 0
    const subPluginAddress = '0x92e9d0Cd7f5E87a2B2b19661aAa4C2e6D019472F'
    const sppPluginAddress = '0x86313457a83Ad93e01a620Cd91A28808b2A048fc'
    const network = NetworksEnum.ethereumSepolia
    const resultType = await ProposalHelper.getBodyResult(
      proposalIndex,
      stage,
      sppPluginAddress,
      subPluginAddress,
      network,
    )
    expect(resultType).to.eq(2)
  })

  it('getSppSubPluginProposals', async () => {
    const proposalIndex = '112752888644088828421229102301752525246334728812632346860355098309410146772331'
    const stage = 0
    const pluginAddress = '0xC6fDd9332092a489DA3A4FC4495D391d6c60dF20'
    const sppPluginAddress = '0x1c288BaF4eA0f3BD762332D3a9bF81488aa3E3db'
    const network = NetworksEnum.ethereumSepolia
    const proposalId = await ProposalHelper.getSppSubPluginProposals(
      proposalIndex,
      stage,
      pluginAddress,
      sppPluginAddress,
      network,
    )
    expect(proposalId).to.eq(0n)
  })

  it('getProposalSpp', async () => {
    const proposalIndex = '112752888644088828421229102301752525246334728812632346860355098309410146772331'
    const pluginAddress = '0xC6fDd9332092a489DA3A4FC4495D391d6c60dF20'
    const network = NetworksEnum.ethereumSepolia
    const proposal: any = await ProposalHelper.getProposalSpp({
      proposalIndex,
      pluginAddress,
      network,
    })
    expect(proposal.executed).to.be.true
  })

  it('getProposalTokenVoting', async () => {
    const proposalIndex = '2'
    const pluginAddress = '0xB85380977eC3435aeBc13e29b01AF990393bdED9'
    const network = NetworksEnum.ethereumMainnet
    const proposal: any = await ProposalHelper.getProposalTokenVoting({
      proposalIndex,
      pluginAddress,
      network,
    })
    expect(proposal.executed).to.be.false
  })

  it('getProposalMultisig', async () => {
    const proposalIndex = '0'
    const pluginAddress = '0xE61C3E80F99cc1587D3456EAff9E110DFCD28c5E'
    const network = NetworksEnum.ethereumSepolia
    const proposal: any = await ProposalHelper.getProposalMultisig({
      proposalIndex,
      pluginAddress,
      network,
    })
    expect(proposal.executed).to.be.true
  })
})
