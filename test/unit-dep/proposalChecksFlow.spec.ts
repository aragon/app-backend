import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import AssessmentExecutor from '@modules/proposalChecks/executor'
import RabbitMQ from '@modules/rabbitMQ'
import { ProposalCheckRequestPublisher } from '@services/aragon-dao/proposalCheckRequests'
import { ProposalChecksConsumer } from '@services/aragon-dao/proposalChecks'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { EnumQueueName, type IQueueProposalCheck, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

/**
 * One proposal through the whole machine on a real chain and a real broker. The indexer's own
 * handlers replay the transactions that created the DAO, the plugin and the proposal; the
 * proposal handler inserts the request; publisher, queue, consumer and executor do the rest.
 * The database is dropped before each case, so each one indexes what it needs.
 *
 * Run with the keys exported for the process (test.env holds none):
 *   set -a; eval "$(grep -E '^(TENDERLY_[A-Z_]+|ETHERSCAN_API_KEY|ETHERSCAN_API_BASE_URL|NODES_ETHEREUM_(SEPOLIA|MAINNET)_[A-Z_]+)=' .env.aragon-indexer)"; set +a
 *   TS_NODE_TRANSPILE_ONLY=true pnpm test:unit-dep
 */
const show = (label: string, value: unknown) => console.log(`\n=== ${label}\n${JSON.stringify(value, null, 2)}`) // eslint-disable-line no-console

/** The proposal's request as the handler inserted it, then the flat action tree the rules read. */
const requestOf = async (proposalTx: string, network: NetworksEnum) => {
  const proposal = (await Models.Proposal.findOne({ transactionHash: proposalTx, network }))!
  const request = (await Models.ProposalAssessment.findOne({ proposalId: proposal.id }))!
  show('proposal', {
    id: proposal.id,
    title: proposal.title,
    creator: proposal.creatorAddress,
    actions: proposal.rawActions.length,
  })
  show('request', {
    id: request.id,
    status: request.status,
    causeId: request.causeId,
    evidenceBlock: request.captured.evidenceBlock,
  })
  show(
    'action tree',
    AssessmentContextBuilder._flatten(request.captured.rawActions, request.daoAddress).map(a => ({
      path: a.path,
      via: a.via,
      caller: a.caller,
      target: a.target,
      call: a.decoded
        ? `${a.decoded.name}(${Object.values(a.decoded.args).join(', ').slice(0, 80)})`
        : `${a.decoding} ${a.selector}`,
    })),
  )
  return request
}

/** One consumer for the whole file: a consumer stays attached across cases, so each delivery goes to the case waiting for its id. */
const waiting = new Map<string, { resolve: () => void; reject: (error: unknown) => void }>()
const consume = () =>
  RabbitMQHelper.process(EnumQueueName.proposalChecks, async (job: IQueueProposalCheck) => {
    const waiter = waiting.get(job.params.requestId)
    if (!waiter) return
    await ProposalChecksConsumer.handle(job, AssessmentExecutor.run).then(waiter.resolve, waiter.reject)
  })

/** Publisher → broker → consumer → executor, then the stored document. */
const assess = async (requestId: string) => {
  const delivered = new Promise<void>((resolve, reject) => waiting.set(requestId, { resolve, reject }))
  await ProposalCheckRequestPublisher.start()
  await delivered
  const result = (await Models.ProposalAssessment.findOne({ id: requestId }))!
  show('checks', result.checks)
  show('reasons', result.reasons)
  show(
    'findings',
    result.findings.map(f => ({
      id: f.id,
      kind: f.kind,
      severity: f.severity,
      labels: f.labels,
      notify: f.notify,
      title: f.title,
      details: f.details,
      limit: f.evidenceLimit,
    })),
  )
  show('evidence', result.evidence)
  show('status', { status: result.status, promotedAt: result.promotedAt, missing: result.coverage?.missing })
  return result
}

describe.only('Integ: proposal checks flow', () => {
  const sandbox = sinon.createSandbox()
  let enabled: boolean

  before(async () => {
    await RabbitMQ.connect()
    await consume()
  })

  beforeEach(() => {
    enabled = config.PROPOSAL_CHECKS.ENABLED
    config.PROPOSAL_CHECKS.ENABLED = true
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves() // other handlers fan out to queues nobody consumes here
  })

  afterEach(() => {
    config.PROPOSAL_CHECKS.ENABLED = enabled
    sandbox.restore()
  })

  after(async () => {
    await RabbitMQ.close()
  })

  it('Sepolia: a DAO uninstalls its admin plugin', async function () {
    this.timeout(600_000)
    const network = NetworksEnum.ethereumSepolia
    const daoCreated = '0x55049264c60ddcc16cfc8cd60579ecf53ef9b59e4150404b2b80d8f040d566c9'
    const pluginInstalled = '0x42ea79324c9bbc70c953265aed45431fbf461ede48903c6820fdcb302bee2668'
    const uninstallPrepared = '0x09e3bbc8297d2d1918ff229a88f4f8400489769929ac8678512e78a0dd5bd9e4'
    const proposalCreated = '0x8cca7a5f265beb93224a50906bfd1c695228def47032838fcf690887d5725456'
    const adminRepo = '0x152c9E28995E418870b85cbbc0AEE4e53020edb2'

    await LibUtils.registerPluginRepos(network)
    // The admin repo is registered on Sepolia; the repo fixture the tests ship does not list it.
    await Models.PluginRepo.create({
      id: `${network}-admin`,
      network,
      pluginRepo: adminRepo,
      subdomain: 'admin',
      transactionHash: '0x' + '0'.repeat(64),
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 1,
      blockTimestamp: 1,
    } as any)
    await LibUtils.handleEventsFromTxHashes([daoCreated, pluginInstalled, uninstallPrepared, proposalCreated], network)

    const request = await requestOf(proposalCreated, network)
    const result = await assess(request.id)

    expect(result.promotedAt).to.be.instanceOf(Date)
  })

  it.only('Mainnet: the Term Parity Prime takeover (incident 6.2) at its creation block', async function () {
    this.timeout(900_000)
    const network = NetworksEnum.ethereumMainnet
    // The guardian DAO, its token voting plugin, settings and permissions all come from one transaction.
    const daoCreated = '0xbd156b21cd261fc16c1b3d629aad759b13b89f38b28e9b3ff119df47813e455b'
    // 14 actions: three Roles calls zero the Delay's cooldown and expiration and enable the DAO as its
    // module, then the DAO queues and executes through the Delay to take the vault's governor role.
    const proposalCreated = '0x42864c87c7a7d4f62f9107b0366556d6d3e7c91d7f495b5f7bd2ea3874499183'

    await LibUtils.registerPluginRepos(network)
    await LibUtils.handleEventsFromTxHashes([daoCreated, proposalCreated], network)

    const request = await requestOf(proposalCreated, network)
    const result = await assess(request.id)

    expect(result.promotedAt).to.be.instanceOf(Date)
  })
})
