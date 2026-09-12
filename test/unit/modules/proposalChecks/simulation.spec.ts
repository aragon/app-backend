import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import logger from '@logger'
import ProposalSimulator, { SIMULATION_NETWORKS } from '@modules/proposalChecks/simulation'
import TenderlyModule from '@modules/tenderly'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface, MaxUint256, id as keccakId } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const daoInterface = new Interface(DAO.abi)
const APPROVAL_TOPIC = keccakId('Approval(address,address,uint256)')
const word = (address: string) => `0x${'00'.repeat(12)}${address.slice(2).toLowerCase()}`
const executedLog = (dao: string, actions: [string, bigint, string][], allowFailureMap: bigint, failureMap: bigint) => {
  const encoded = daoInterface.encodeEventLog('Executed', [
    '0x' + '11'.repeat(20),
    '0x' + '00'.repeat(32),
    actions,
    allowFailureMap,
    failureMap,
    actions.map(() => '0x'),
  ])
  return { raw: { address: dao, topics: encoded.topics, data: encoded.data } }
}

const decatsRequest = () =>
  fakeProposalAssessment({
    captured: { ...fakeProposalAssessment().captured, rawActions: DECATS.rawActions, allowFailureMap: '3' },
  })

const tenderlyResponse = (overrides: Record<string, unknown> = {}) => ({
  simulation: { id: 'sim-1', project_id: 'p', status: true, block_number: 90094457, network_id: '137', created_at: '' },
  transaction: {
    status: true,
    transaction_info: {
      asset_changes: [
        {
          type: 'Transfer',
          from: DECATS.daoAddress,
          to: DECATS.creatorAddress,
          raw_amount: '1369000000000000000000',
          token_info: {
            contract_address: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
            standard: 'ERC20',
            symbol: 'DECATS',
          },
        },
        {
          type: 'Transfer',
          from: DECATS.daoAddress,
          to: DECATS.creatorAddress,
          raw_amount: '5',
          token_info: { standard: 'NativeCurrency' },
        },
      ],
      logs: [
        executedLog(DECATS.daoAddress, [[DECATS.rawActions[0].to, 0n, DECATS.rawActions[0].data]], 3n, 0n),
        {
          raw: {
            address: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
            topics: [APPROVAL_TOPIC, word(DECATS.daoAddress), word(DECATS.creatorAddress)],
            data: `0x${MaxUint256.toString(16)}`,
          },
        },
        { raw: { address: '0x', topics: ['0xdead'], data: '0x' } },
      ],
    },
    ...overrides,
  },
})

describe('proposalChecks/simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it("simulates the plugin calling execute at the evidence block with the proposal's own failure map", async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    const share = sandbox.stub(TenderlyModule, 'createShareableUrl').resolves('https://share/sim-1')
    const rpc = sandbox.stub(TenderlyModule, 'rpcCall').resolves(tenderlyResponse())
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const facts = await ProposalSimulator.simulate(request)

    const payload = rpc.args[0][1]
    expect(rpc.args[0][0]).to.eq('https://tenderly.test/simulate')
    expect(payload).to.include({
      network_id: '137',
      block_number: 90094457,
      from: request.pluginAddress,
      to: request.daoAddress,
      simulation_type: 'full',
    })
    const decoded = daoInterface.parseTransaction({ data: payload.input })!
    expect(decoded.name).to.eq('execute')
    expect(decoded.args[1].length).to.eq(1)
    expect(decoded.args[1][0][0]).to.eq('0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18')
    expect(decoded.args[2]).to.eq(3n)

    expect(facts.status).to.eq('ok')
    expect(facts.simulationId).to.eq('sim-1')
    expect(facts.shareUrl).to.eq(null)
    expect(share.called).to.be.false
    expect(facts.block).to.eq(90094457)
    expect(facts.movements.map(m => [m.asset, m.standard, m.from, m.to, m.amount])).to.deep.eq([
      [
        '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
        'ERC20',
        DECATS.daoAddress,
        DECATS.creatorAddress,
        '1369000000000000000000',
      ],
      ['native', null, DECATS.daoAddress, DECATS.creatorAddress, '5'],
    ])
    expect(facts.executions).to.deep.eq([{ dao: DECATS.daoAddress, actions: 1, allowFailureMap: '3', failureMap: '0' }])
    expect(facts.approvals).to.deep.eq([
      {
        token: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
        owner: DECATS.daoAddress.toLowerCase(),
        spender: DECATS.creatorAddress.toLowerCase(),
        amount: MaxUint256.toString(),
        unlimited: true,
      },
    ])
  })

  it('reports a revert with its reason and no effects', async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    sandbox.stub(TenderlyModule, 'createShareableUrl').resolves(false)
    sandbox
      .stub(TenderlyModule, 'rpcCall')
      .resolves(tenderlyResponse({ status: false, error_info: { error_message: 'DaoUnauthorized' } }))
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const facts = await ProposalSimulator.simulate(request)

    expect(facts).to.include({ status: 'reverted', reason: 'DaoUnauthorized', simulationId: 'sim-1', shareUrl: null })
    expect(facts.movements).to.deep.eq([])
    expect(facts.approvals).to.deep.eq([])
    expect(facts.executions).to.deep.eq([])
  })

  it('is unsupported off the known networks and when the provider is not configured, without calling out', async () => {
    const rpc = sandbox.stub(TenderlyModule, 'rpcCall')
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    const sepolia = await Models.ProposalAssessment.create(decatsRequest())
    await Models.ProposalAssessment.updateOne({ id: sepolia.id }, { $set: { network: NetworksEnum.zksyncMainnet } })
    const off = (await Models.ProposalAssessment.findOne({ id: sepolia.id }))!

    const unsupported = await ProposalSimulator.simulate(off)
    expect(unsupported.status).to.eq('unsupported')
    expect(unsupported.reason).to.contain('no simulation support for zksync-mainnet')

    sandbox.restore()
    sandbox = sinon.createSandbox()
    sandbox.stub(TenderlyModule, 'isConfigured').returns(false)
    const request = await Models.ProposalAssessment.create({ ...decatsRequest(), id: 'other' })
    const unconfigured = await ProposalSimulator.simulate(request)
    expect(unconfigured.status).to.eq('unsupported')
    expect(unconfigured.reason).to.contain('not configured')
    expect(rpc.called).to.be.false
  })

  it('treats a response with no transaction outcome as failed, never as clean or executable', async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    sandbox.stub(TenderlyModule, 'rpcCall').resolves({ simulation: { id: 'sim-x', status: false } })
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const facts = await ProposalSimulator.simulate(request)
    const validation = await ProposalSimulator.validate(request, {
      interfaceType: IPluginInterfaceType.tokenVoting,
      proposalIndex: '1',
    })

    expect(facts.status).to.eq('failed')
    expect(facts.reason).to.contain('no transaction outcome')
    expect(validation.status).to.eq('failed')
    expect(validation.simulationId).to.eq('sim-x')
  })

  it('reports a failed request as failed, never as clean', async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    sandbox.stub(TenderlyModule, 'rpcCall').resolves(undefined)
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const facts = await ProposalSimulator.simulate(request)

    expect(facts.status).to.eq('failed')
    expect(facts.movements).to.deep.eq([])
  })

  it("validates by calling the plugin's own execute as an account with no permissions", async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    const rpc = sandbox
      .stub(TenderlyModule, 'rpcCall')
      .resolves({ simulation: { id: 'v-1' }, transaction: { status: true } })
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const result = await ProposalSimulator.validate(request, {
      interfaceType: IPluginInterfaceType.tokenVoting,
      proposalIndex: '7',
    })

    const payload = rpc.args[0][1]
    expect(payload).to.include({
      from: '0x000000000000000000000000000000000000dEaD',
      to: request.pluginAddress,
      block_number: 90094457,
    })
    expect(
      new Interface(['function execute(uint256 _proposalId)']).parseTransaction({ data: payload.input })!.args[0],
    ).to.eq(7n)
    expect(result).to.deep.eq({ status: 'executable', reason: null, simulationId: 'v-1', block: 90094457 })
  })

  it('tells a proposal that is not passed yet apart from one whose execution is refused', async () => {
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
    sandbox.stub(TenderlyModule, 'baseUrl').returns('https://tenderly.test')
    const rpc = sandbox.stub(TenderlyModule, 'rpcCall')
    rpc.onFirstCall().resolves({
      simulation: { id: 'v-1' },
      transaction: {
        status: false,
        error_info: { error_message: 'execution reverted' },
        transaction_info: { call_trace: { from: '0x', to: '0x', output: '0x9fefd0f1' + '00'.repeat(31) + '07' } },
      },
    })
    rpc.onSecondCall().resolves({
      simulation: { id: 'v-2' },
      transaction: { status: false, error_info: { error_message: 'DaoUnauthorized' } },
    })
    const request = await Models.ProposalAssessment.create(decatsRequest())
    const plugin = { interfaceType: IPluginInterfaceType.multisig, proposalIndex: '7' }

    expect(await ProposalSimulator.validate(request, plugin)).to.include({
      status: 'notYet',
      reason: 'ProposalExecutionForbidden: the plugin does not allow execution yet',
    })
    expect(await ProposalSimulator.validate(request, plugin)).to.include({
      status: 'reverted',
      reason: 'DaoUnauthorized',
    })
  })

  it('does not validate a plugin type it has no entry point for, or an unindexed plugin', async () => {
    const rpc = sandbox.stub(TenderlyModule, 'rpcCall')
    const request = await Models.ProposalAssessment.create(decatsRequest())

    const spp = await ProposalSimulator.validate(request, {
      interfaceType: IPluginInterfaceType.spp,
      proposalIndex: '1',
    })
    const none = await ProposalSimulator.validate(request, { interfaceType: null, proposalIndex: '1' })

    expect(spp.status).to.eq('unsupported')
    expect(spp.reason).to.contain('spp')
    expect(none.reason).to.contain('unindexed plugin')
    expect(rpc.called).to.be.false
  })

  it('names the networks it supports, Sepolia included for real runs', () => {
    expect(SIMULATION_NETWORKS).to.include(NetworksEnum.ethereumMainnet)
    expect(SIMULATION_NETWORKS).to.include(NetworksEnum.ethereumSepolia)
    expect(SIMULATION_NETWORKS).to.not.include(NetworksEnum.zksyncMainnet)
  })
})
