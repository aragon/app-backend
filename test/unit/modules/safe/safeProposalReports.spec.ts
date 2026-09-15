import logger from '@logger'
import { type IAragonProposalReport, type ISafeMultisigTransaction, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, concat, id, toBeHex } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const SPP = '0xc18021bF09671A21F474A8C059c987BA895bDBF7'
const OTHER_SPP = '0x1111111111111111111111111111111111111111'
const MULTISEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526'
const NETWORK = NetworksEnum.ethereumSepolia

/** The live sepolia value from the correlation spec: a `uint256` no `number` can hold. */
const CONTRACT_PROPOSAL_ID = '89751198517555286281858792404674662298693294198813135077036585629162454549545'

const coder = AbiCoder.defaultAbiCoder()

const reportCalldata = (proposalIndex: string, stageId = 0, resultType = 2) =>
  concat([
    id('reportProposalResult(uint256,uint16,uint8,bool)').slice(0, 10),
    coder.encode(['uint256', 'uint16', 'uint8', 'bool'], [BigInt(proposalIndex), stageId, resultType, true]),
  ])

/** `operation(1) to(20) value(32) dataLength(32) data(n)` per inner call, packed with no padding. */
const packCalls = (calls: Array<{ to: string; data: string }>) =>
  concat(calls.map(call => concat(['0x00', call.to, toBeHex(0, 32), toBeHex(call.data.length / 2 - 1, 32), call.data])))

const multiSendCalldata = (packed: string) =>
  concat([id('multiSend(bytes)').slice(0, 10), coder.encode(['bytes'], [packed])])

const transaction = (to: string, data: string | null): ISafeMultisigTransaction => ({
  safeTxHash: `0x${'a'.repeat(64)}`,
  nonce: '9',
  from: OTHER_SPP,
  to,
  value: '0',
  data,
  operation: 0,
  safeTxGas: '0',
  baseGas: '0',
  gasPrice: '0',
  gasToken: OTHER_SPP,
  refundReceiver: OTHER_SPP,
  confirmations: [],
  confirmationsRequired: 1,
  signatures: null,
  isExecuted: false,
  isSuccessful: null,
  submissionDate: '2026-09-15T12:00:00.000Z',
})

describe('Module: safe/safeProposalReports', () => {
  let sandbox: SinonSandbox
  let find: sinon.SinonStub
  let settingFind: sinon.SinonStub

  /**
   * `bodies` are the SPP plugins whose active Setting lists SAFE as a stage body - i.e. the reports
   * SAFE is authorized to make. Defaults to every plugin the proposals belong to.
   */
  const load = (proposals: Array<Record<string, unknown>>, bodies?: string[]) => {
    find = sandbox.stub().returns({
      select: () => ({ lean: () => ({ exec: async () => proposals }) }),
    })
    const authorized = bodies ?? proposals.map(proposal => proposal.pluginAddress as string)
    settingFind = sandbox.stub().returns({
      select: () => ({
        lean: () => ({
          exec: async () =>
            authorized.map(pluginAddress => ({
              pluginAddress,
              stages: [{ plugins: [{ address: SAFE }] }],
              externalProposers: [],
            })),
        }),
      }),
    })

    return proxyquire.noCallThru().noPreserveCache()('@modules/safe/safeProposalReports', {
      '@dbModels': { Models: { Proposal: { find }, Setting: { find: settingFind } } },
    }).attachProposalReports
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => sandbox.restore())

  // Pinned against the value observed in live sepolia calldata: if the deployed SPP signature ever
  // differs from the local ABI, the word layout this module decodes is wrong, and the resulting
  // zero-match would look identical to "not a report transaction".
  it('derives the live sepolia selector from the local SPP signature', () => {
    expect(id('reportProposalResult(uint256,uint16,uint8,bool)').slice(0, 10)).to.equal('0x52303962')
  })

  it('correlates a queued report to the backend incrementalId, not the contract proposal id', async () => {
    const attach = load([
      {
        pluginAddress: SPP,
        proposalIndex: CONTRACT_PROPOSAL_ID,
        incrementalId: 4,
        daoAddress: '0x665928FeacC8739116A3f2eF66a9c61936348DC2',
      },
    ])

    const [result] = await attach(NETWORK, SAFE, [transaction(SPP, reportCalldata(CONTRACT_PROPOSAL_ID))])

    expect(result.aragonReports).to.deep.equal([
      {
        daoId: 'ethereum-sepolia-0x665928FeacC8739116A3f2eF66a9c61936348DC2',
        bodyId: SPP,
        proposalId: 4,
        stageId: '0',
        resultType: 2,
      },
    ])
  })

  it('returns every report in a batch that also carries unrelated calls', async () => {
    const attach = load([
      { pluginAddress: SPP, proposalIndex: '7', incrementalId: 2, daoAddress: OTHER_SPP },
      { pluginAddress: OTHER_SPP, proposalIndex: '8', incrementalId: 3, daoAddress: OTHER_SPP },
    ])

    const batch = multiSendCalldata(
      packCalls([
        { to: SPP, data: reportCalldata('7') },
        { to: OTHER_SPP, data: '0x12345678' },
        { to: OTHER_SPP, data: reportCalldata('8', 1, 1) },
      ]),
    )

    const [result] = await attach(NETWORK, SAFE, [transaction(MULTISEND, batch)])

    expect(result.aragonReports).to.deep.equal([
      { daoId: `ethereum-sepolia-${OTHER_SPP}`, bodyId: SPP, proposalId: 2, stageId: '0', resultType: 2 },
      { daoId: `ethereum-sepolia-${OTHER_SPP}`, bodyId: OTHER_SPP, proposalId: 3, stageId: '1', resultType: 1 },
    ])
  })

  it('ignores a truncated MultiSend tail rather than losing the calls before it', async () => {
    const attach = load([{ pluginAddress: SPP, proposalIndex: '7', incrementalId: 2, daoAddress: OTHER_SPP }])

    const packed = packCalls([
      { to: SPP, data: reportCalldata('7') },
      { to: OTHER_SPP, data: reportCalldata('8') },
    ])
    // Cut the last inner call short: its length prefix now overruns the payload, so the walk stops
    // there. The call already read is still true.
    const truncated = multiSendCalldata(packed.slice(0, packed.length - 40))

    const [result] = await attach(NETWORK, SAFE, [transaction(MULTISEND, truncated)])

    expect(result.aragonReports).to.deep.equal([
      { daoId: `ethereum-sepolia-${OTHER_SPP}`, bodyId: SPP, proposalId: 2, stageId: '0', resultType: 2 },
    ])
  })

  it('leaves ordinary transactions untouched without querying', async () => {
    const attach = load([])
    const input = [transaction(OTHER_SPP, '0x'), transaction(OTHER_SPP, null)]

    const results = await attach(NETWORK, SAFE, input)

    expect(results).to.equal(input)
    expect(find.called).to.equal(false)
  })

  // Absence means "not a recognised report". An unresolved report must stay distinguishable from an
  // ordinary transfer, or the app presents a governance transaction as an anonymous payload.
  it('reports an empty array when the reported proposal is not indexed', async () => {
    const attach = load([])

    const [result] = await attach(NETWORK, SAFE, [transaction(SPP, reportCalldata('7'))])

    expect(result.aragonReports).to.deep.equal([])
  })

  // Both halves of the correlation key come from calldata the queuer chose, so a rogue owner of
  // this Safe could otherwise name any indexed plugin and have us render a link into another DAO.
  it('drops a report to a plugin this Safe is not a body of', async () => {
    const attach = load(
      [{ pluginAddress: SPP, proposalIndex: '7', incrementalId: 2, daoAddress: OTHER_SPP }],
      // The Safe is a body of some other process, not of the plugin it is reporting to.
      [OTHER_SPP],
    )

    const [result] = await attach(NETWORK, SAFE, [transaction(SPP, reportCalldata('7'))])

    expect(result.aragonReports).to.deep.equal([])
  })

  // Load-bearing for the app: it lists every proposal a batch reports to, so order must be the one
  // a reviewer can check against the payload, and a batch reporting the same proposal twice with
  // conflicting results must stay visible rather than being deduped into agreement.
  it('preserves calldata order and duplicate reports', async () => {
    const attach = load([
      { pluginAddress: SPP, proposalIndex: '7', incrementalId: 2, daoAddress: OTHER_SPP },
      { pluginAddress: OTHER_SPP, proposalIndex: '8', incrementalId: 3, daoAddress: OTHER_SPP },
    ])

    const batch = multiSendCalldata(
      packCalls([
        { to: OTHER_SPP, data: reportCalldata('8', 0, 1) },
        { to: SPP, data: reportCalldata('7', 0, 2) },
        { to: SPP, data: reportCalldata('7', 0, 3) },
      ]),
    )

    const [result] = await attach(NETWORK, SAFE, [transaction(MULTISEND, batch)])

    expect(
      result.aragonReports?.map((report: IAragonProposalReport) => [report.proposalId, report.resultType]),
    ).to.deep.equal([
      [3, 1],
      [2, 2],
      [2, 3],
    ])
  })

  it('accepts a report from a Safe listed only as an external proposer', async () => {
    const attach = load([{ pluginAddress: SPP, proposalIndex: '7', incrementalId: 2, daoAddress: OTHER_SPP }], [])
    settingFind.returns({
      select: () => ({
        lean: () => ({
          exec: async () => [{ pluginAddress: SPP, stages: [], externalProposers: [{ address: SAFE }] }],
        }),
      }),
    })

    const [result] = await attach(NETWORK, SAFE, [transaction(SPP, reportCalldata('7'))])

    expect(result.aragonReports?.[0].proposalId).to.equal(2)
  })

  it('marks reports as unresolved rather than ordinary when correlation fails', async () => {
    const attach = load([])
    find.throws(new Error('mongo down'))

    const results = await attach(NETWORK, SAFE, [transaction(SPP, reportCalldata('7')), transaction(OTHER_SPP, '0x')])

    expect(results[0].aragonReports).to.deep.equal([])
    expect(results[1]).to.not.have.property('aragonReports')
  })
})
