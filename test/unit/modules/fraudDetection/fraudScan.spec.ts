import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { FRAUD_IFACE } from '@modules/fraudDetection/constants'
import FraudScan from '@modules/fraudDetection/fraudScan'
import TelegramModule from '@modules/telegram'
import TenderlyModule from '@modules/tenderly'
import { DaoList } from '@test/mock/fakeDao'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import { FakeVote } from '@test/mock/fakeVote'
import { FraudulentProposalList } from '@test/mock/fakeFraudulentProposals'
import { EnumQueueName } from '@types'
import { expect } from 'chai'
import { id as keccakId } from 'ethers'
import * as sinon from 'sinon'

const ATTACKER = '0x9999999999999999999999999999999999999999'
const OTHER_PLUGIN = '0x7777777777777777777777777777777777777777'

const EXECUTE_PERMISSION = keccakId('EXECUTE_PERMISSION')
const ROOT_PERMISSION = keccakId('ROOT_PERMISSION')
const UPGRADE_PLUGIN_PERMISSION = keccakId('UPGRADE_PLUGIN_PERMISSION')
const NEW_IMPLEMENTATION = '0xcd2CC5fA305f53c656CCbf8ca44238CB2dd95C51'

const drainAction = (token: string) => ({
  to: token,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('transfer', [ATTACKER, 1_000_000n]),
})

/**
 * The takeover shape seen on mainnet in August 2026: the plugin's own proxy is upgraded and
 * the new code is initialised with an address of the attacker's choosing.
 */
const upgradeAction = (proxy: string, initBeneficiary?: string) => ({
  to: proxy,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('upgradeToAndCall', [
    NEW_IMPLEMENTATION,
    initBeneficiary
      ? keccakId('initializeFrom(address)').slice(0, 10) + initBeneficiary.slice(2).padStart(64, '0')
      : '0x',
  ]),
})

const seed = async (
  opts: { rawActions: any[]; pluginOverrides?: Record<string, any>; daoOverrides?: Record<string, any> } = {
    rawActions: [],
  },
) => {
  const rawPlugin = { ...structuredClone(PluginList[0]), ...opts.pluginOverrides }
  const plugin = await Models.Plugin.create(rawPlugin)

  await Models.Dao.create({
    ...structuredClone(DaoList[0]),
    address: plugin.daoAddress,
    network: plugin.network,
    blockTimestamp: 1_600_000_000,
    ...opts.daoOverrides,
  })

  const rawProposal: any = {
    ...structuredClone(ProposalList[0]),
    pluginAddress: plugin.address,
    daoAddress: plugin.daoAddress,
    network: plugin.network,
    rawActions: opts.rawActions,
  }
  // The mock settings carry a sub-24h minDuration, which adds the shortWindow signal —
  // pin a long window so these tests only exercise the signals they are about.
  rawProposal.settings = { ...rawProposal.settings, minDuration: 7 * 24 * 3600 }
  // Another spec creates from the shared mock by reference, which stamps an id onto it.
  // Drop it so this proposal's id is derived from the fields we just overrode.
  rawProposal.id = undefined
  const proposal = await Models.Proposal.create(rawProposal)

  return { plugin, proposal }
}

/** Gives the proposal's creator a track record in the DAO, before this proposal's block. */
const seedCreatorHistory = async (proposal: any, count: number) => {
  for (let i = 0; i < count; i++) {
    await Models.Proposal.create({
      ...structuredClone(ProposalList[0]),
      id: undefined,
      transactionHash: `0xbb${String(i).padStart(62, '0')}`,
      proposalIndex: `90${i}`,
      incrementalId: 900 + i,
      pluginAddress: proposal.pluginAddress,
      daoAddress: proposal.daoAddress,
      network: proposal.network,
      creatorAddress: proposal.creatorAddress,
      blockTimestamp: proposal.blockTimestamp - 7200,
    } as any)
    await Models.Vote.create({
      ...structuredClone(FakeVote),
      id: `prior-vote-${i}`,
      transactionHash: `0xcc${String(i).padStart(62, '0')}`,
      logIndex: 100 + i,
      network: proposal.network,
      daoAddress: proposal.daoAddress,
      pluginAddress: proposal.pluginAddress,
      proposalIndex: `90${i}`,
      memberAddress: proposal.creatorAddress,
      blockTimestamp: proposal.blockTimestamp - 7200,
    })
  }
}

describe('Module: fraudDetection/fraudScan', () => {
  it('persists a finding for a drain-shaped proposal on a standalone token voting plugin', async () => {
    const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

    const finding = await FraudScan.scanProposal(proposal.id)

    expect(finding).to.not.equal(null)
    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.creationScore).to.equal(55)
    expect(stored.creationLevel).to.equal('high')
    expect(stored.attackClass).to.deep.equal(['transfer'])
    expect(stored.transfers).to.deep.equal([
      { token: ProposalList[0].settings.tokenAddress, to: ATTACKER, amount: '1000000' },
    ])
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal(['outsiderCreator', 'recipientOutsider'])
    expect(stored.alertedAt).to.equal(null)
    expect(stored.suppressedAs).to.equal(null)
  })

  it('treats a dangerous grant to a plugin of the same DAO as system wiring', async () => {
    const { plugin, proposal } = await seed({
      rawActions: [
        {
          to: PluginList[0].daoAddress,
          value: '0',
          data: FRAUD_IFACE.encodeFunctionData('grant', [PluginList[0].daoAddress, OTHER_PLUGIN, EXECUTE_PERMISSION]),
        },
      ],
    })
    await Models.Plugin.create({
      ...structuredClone(PluginList[0]),
      address: OTHER_PLUGIN,
      daoAddress: plugin.daoAddress,
    })

    await FraudScan.scanProposal(proposal.id)

    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal(['outsiderCreator', 'containedPermissionGrant'])
    expect(stored.creationScore).to.equal(50)
  })

  it('discards proposals from a token voting plugin that is an SPP child', async () => {
    const { proposal } = await seed({
      rawActions: [drainAction(ProposalList[0].settings.tokenAddress)],
      pluginOverrides: { isSubPlugin: true, parentPlugin: '0x1212121212121212121212121212121212121212' },
    })

    const finding = await FraudScan.scanProposal(proposal.id)

    expect(finding).to.equal(null)
    expect(await Models.ProposalFinding.countDocuments({})).to.equal(0)
  })

  it('records a scanned proposal that matches no attack class, with an empty verdict', async () => {
    const { proposal } = await seed({
      rawActions: [{ to: ATTACKER, value: '0', data: '0xdeadbeef0000000000000000000000000000000000000000' }],
    })

    await FraudScan.scanProposal(proposal.id)

    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.attackClass).to.deep.equal([])
    expect(stored.score).to.equal(0)
    expect(stored.signals).to.deep.equal([])
  })

  it('stores a single finding when the queue message is delivered twice', async () => {
    const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

    await FraudScan.scanProposal(proposal.id)
    await FraudScan.scanProposal(proposal.id)

    expect(await Models.ProposalFinding.countDocuments({ id: proposal.id })).to.equal(1)
  })

  it('ignores proposals from plugins that do not execute directly on the DAO', async () => {
    const { proposal } = await seed({
      rawActions: [drainAction(ProposalList[0].settings.tokenAddress)],
      pluginOverrides: { interfaceType: 'multisig' },
    })

    const finding = await FraudScan.scanProposal(proposal.id)

    expect(finding).to.equal(null)
  })

  it('flags a proposal that upgrades the code of the plugin deciding it', async () => {
    const { plugin, proposal } = await seed({
      rawActions: [upgradeAction(PluginList[0].address, ProposalList[0].creatorAddress)],
    })

    const finding = await FraudScan.scanProposal(proposal.id)

    expect(finding).to.not.equal(null)
    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.attackClass).to.deep.equal(['upgrade'])
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal([
      'outsiderCreator',
      'governancePluginUpgrade',
      'upgradeInitBeneficiary',
    ])
    expect(stored.creationScore).to.equal(90)
    expect(stored.creationLevel).to.equal('critical')
    expect(stored.upgrades).to.deep.equal([
      {
        target: plugin.address,
        implementation: NEW_IMPLEMENTATION,
        initSelector: keccakId('initializeFrom(address)').slice(0, 10),
        initAddresses: [ProposalList[0].creatorAddress],
      },
    ])
  })

  it('scores a bare upgrade of another proxy lower than one of the deciding plugin', async () => {
    const { proposal } = await seed({ rawActions: [upgradeAction(OTHER_PLUGIN)] })

    await FraudScan.scanProposal(proposal.id)

    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal(['outsiderCreator', 'proxyUpgrade'])
    expect(stored.upgrades[0].initSelector).to.equal(null)
    expect(stored.creationScore).to.equal(55)
  })

  it('keeps a routine upgrade by an established member under the alert line', async () => {
    const { proposal } = await seed({ rawActions: [upgradeAction(PluginList[0].address)] })
    await seedCreatorHistory(proposal, 3)

    await FraudScan.scanProposal(proposal.id)

    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal(['establishedCreator', 'governancePluginUpgrade'])
    expect(stored.creationScore).to.equal(0)
    expect(FraudScan.isAlertWorthy(stored)).to.equal(false)
  })

  it('treats a standing grant of UPGRADE_PLUGIN_PERMISSION as a dangerous grant', async () => {
    const { plugin, proposal } = await seed({
      rawActions: [
        {
          to: PluginList[0].daoAddress,
          value: '0',
          data: FRAUD_IFACE.encodeFunctionData('grant', [PluginList[0].address, ATTACKER, UPGRADE_PLUGIN_PERMISSION]),
        },
      ],
    })

    await FraudScan.scanProposal(proposal.id)

    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.permissionOps).to.deep.equal([
      {
        operation: 'Grant',
        where: plugin.address,
        who: ATTACKER,
        permissionId: UPGRADE_PLUGIN_PERMISSION,
        permissionName: 'UPGRADE_PLUGIN_PERMISSION',
        dangerous: true,
      },
    ])
    expect(stored.signals.map((s: any) => s.name)).to.deep.equal(['outsiderCreator', 'dangerousPermissionGrant'])
  })

  it('scans a lock-to-vote plugin the same way as token voting', async () => {
    const { proposal } = await seed({
      rawActions: [upgradeAction(PluginList[0].address, ProposalList[0].creatorAddress)],
      pluginOverrides: { interfaceType: 'lockToVote' },
    })

    const finding = await FraudScan.scanProposal(proposal.id)

    expect(finding).to.not.equal(null)
    const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
    expect(stored.attackClass).to.deep.equal(['upgrade'])
    expect(stored.creationLevel).to.equal('critical')
  })

  describe('telegram alerting', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
    })

    afterEach(() => {
      sandbox?.restore()
    })

    it('alerts once and stamps alertedAt, even when the message is delivered twice', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)
      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('HIGH')
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.not.equal(null)
    })

    it('persists the finding but skips the alert while Telegram is not configured', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(false)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)

      expect(postStub.notCalled).to.be.true
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.equal(null)
    })

    it('sends the quiet line for a proposal that matched nothing, without simulating it', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const simulateStub = sandbox.stub(TenderlyModule, 'simulateFull').resolves({ status: 'success' } as any)
      const { proposal } = await seed({
        rawActions: [{ to: ATTACKER, value: '0', data: '0xdeadbeef0000000000000000000000000000000000000000' }],
      })

      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('no attack pattern matched')
      expect(simulateStub.notCalled).to.be.true
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAs).to.equal('scanned')
    })

    it('says why a matched proposal stayed under the alert line', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })
      // An established member's transfer scores below the line, so it only gets the note.
      await seedCreatorHistory(proposal, 4)

      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('below the alert line')
      expect(postStub.firstCall.args[0]).to.include('transfer 1000000')
    })

    it('stays silent on a non-alerting proposal when the quiet feed is off', async () => {
      sandbox.stub(config.FRAUD_SCAN, 'NOTIFY_ALL').value(false)
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({
        rawActions: [{ to: ATTACKER, value: '0', data: '0xdeadbeef0000000000000000000000000000000000000000' }],
      })

      await FraudScan.scanProposal(proposal.id)

      expect(postStub.notCalled).to.be.true
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.equal(null)
    })

    it('never alerts a finding suppressed as DAO bootstrap', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const bootstrapGrant = {
        to: PluginList[0].daoAddress,
        value: '0',
        data: FRAUD_IFACE.encodeFunctionData('grant', [
          PluginList[0].daoAddress,
          '0x1313131313131313131313131313131313131313',
          ROOT_PERMISSION,
        ]),
      }
      const { proposal } = await seed({
        rawActions: [bootstrapGrant],
        daoOverrides: { blockTimestamp: ProposalList[0].blockTimestamp - 600 },
      })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.suppressedAs).to.equal('daoBootstrap')
      expect(stored.alertedAs).to.equal('scanned')
      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('suppressed as daoBootstrap')
      expect(postStub.firstCall.args[0]).to.not.include('🚨')
    })

    it('releases the claim and re-queues itself when Telegram fails', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      const postStub = sandbox.stub(TelegramModule, 'sendMessage')
      postStub.onFirstCall().rejects(new Error('telegram down'))
      postStub.onSecondCall().resolves()
      const delayedStub = sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      // The handler must not throw: a throwing handler is never retried by the queue.
      await FraudScan.scanProposal(proposal.id)

      let stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.equal(null)
      expect(stored.alertAttempts).to.equal(1)
      expect(delayedStub.calledOnce).to.be.true
      expect(delayedStub.firstCall.args[0]).to.equal(EnumQueueName.proposalFraudScan)

      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledTwice).to.be.true
      stored = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.not.equal(null)
    })

    it('stops re-queueing once the attempt cap is reached', async () => {
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
      sandbox.stub(TelegramModule, 'sendMessage').rejects(new Error('telegram down'))
      const delayedStub = sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      for (let attempt = 0; attempt < config.FRAUD_SCAN.ALERT_MAX_ATTEMPTS + 2; attempt++) {
        await FraudScan.scanProposal(proposal.id)
      }

      expect(delayedStub.callCount).to.equal(config.FRAUD_SCAN.ALERT_MAX_ATTEMPTS - 1)
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.equal(null)
    })
  })

  describe('tenderly confirmation', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
    })

    afterEach(() => {
      sandbox?.restore()
    })

    it('marks the finding confirmed and links the simulation when it succeeds', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({
        status: 'success',
        shareUrl: 'https://www.tdly.co/shared/simulation/sim-1',
        assetChanges: [{ to: ATTACKER, amount: '1000000' }],
      } as any)
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.simulation.status).to.equal('confirmed')
      expect(postStub.firstCall.args[0]).to.include('simulation shows the decoded effect')
      expect(postStub.firstCall.args[0]).to.include('https://www.tdly.co/shared/simulation/sim-1')
    })

    it('says the simulation reverted but still alerts', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({ status: 'failed', error: 'execution reverted' } as any)
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.simulation.status).to.equal('reverted')
      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('simulation reverted')
    })

    it('says the simulation moved nothing when the decoded transfer does not show up', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({ status: 'success', assetChanges: [] } as any)
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.simulation.status).to.equal('noEffect')
      expect(postStub.firstCall.args[0]).to.include('moved nothing we decoded')
    })

    it('confirms a permission-only proposal on a clean execute, with no asset movement', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({ status: 'success', assetChanges: [] } as any)
      const { proposal } = await seed({
        rawActions: [
          {
            to: PluginList[0].daoAddress,
            value: '0',
            data: FRAUD_IFACE.encodeFunctionData('grant', [PluginList[0].daoAddress, ATTACKER, ROOT_PERMISSION]),
          },
        ],
      })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.simulation.status).to.equal('confirmed')
      expect(postStub.firstCall.args[0]).to.include('simulation shows the decoded effect')
    })

    it('alerts as unconfirmed when Tenderly is not configured', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.simulation.status).to.equal('unconfirmed')
      expect(postStub.firstCall.args[0]).to.include('unconfirmed (simulation unavailable)')
    })

    it('does not simulate again when the alert retries after a Telegram failure', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage')
      postStub.onFirstCall().rejects(new Error('telegram down'))
      postStub.onSecondCall().resolves()
      sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      const simulateStub = sandbox
        .stub(TenderlyModule, 'simulateFull')
        .resolves({ status: 'success', assetChanges: [{ to: ATTACKER }] } as any)
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)
      await FraudScan.scanProposal(proposal.id)

      expect(simulateStub.calledOnce).to.be.true
      expect(postStub.calledTwice).to.be.true
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.alertedAt).to.not.equal(null)
    })
  })

  describe('vote escalation', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(TelegramModule, 'isConfigured').returns(true)
    })

    afterEach(() => {
      sandbox?.restore()
    })

    const castVote = async (proposal: any, memberAddress: string) =>
      Models.Vote.create({
        ...structuredClone(FakeVote),
        id: `${FakeVote.transactionHash}-${memberAddress}-${proposal.proposalIndex}`,
        network: proposal.network,
        daoAddress: proposal.daoAddress,
        pluginAddress: proposal.pluginAddress,
        proposalIndex: proposal.proposalIndex,
        memberAddress,
        blockTimestamp: proposal.blockTimestamp + 60,
      })

    it('escalates and posts a follow-up when the creator is the only voter', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)
      await castVote(proposal, proposal.creatorAddress)
      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledTwice).to.be.true
      expect(postStub.secondCall.args[0]).to.include('ESCALATED HIGH → CRITICAL')
      expect(postStub.secondCall.args[0]).to.include('score 80 (was 55 at creation)')
      expect(postStub.secondCall.args[0]).to.include('selfVoteOnly')

      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.score).to.equal(80)
      expect(stored.level).to.equal('critical')
      expect(stored.creationScore).to.equal(55)
      expect(stored.alertedLevel).to.equal('critical')
    })

    it('stays quiet when another member votes, since the level does not rise', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)
      await castVote(proposal, OTHER_PLUGIN)
      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledOnce).to.be.true
      const stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.level).to.equal('high')
    })

    it('escalates only once when several votes arrive at the same level', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      const { proposal } = await seed({ rawActions: [drainAction(ProposalList[0].settings.tokenAddress)] })

      await FraudScan.scanProposal(proposal.id)
      await castVote(proposal, proposal.creatorAddress)
      await FraudScan.scanProposal(proposal.id)
      await FraudScan.scanProposal(proposal.id)

      expect(postStub.calledTwice).to.be.true
    })

    it('sends a first alert when the self vote lifts a quiet finding over the threshold', async () => {
      const postStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
      // Pays a plugin of the same DAO, by a creator with some history — nothing to alert on.
      const { plugin, proposal } = await seed({
        rawActions: [
          {
            to: ProposalList[0].settings.tokenAddress,
            value: '0',
            data: FRAUD_IFACE.encodeFunctionData('transfer', [OTHER_PLUGIN, 1_000_000n]),
          },
        ],
      })
      await Models.Plugin.create({
        ...structuredClone(PluginList[0]),
        address: OTHER_PLUGIN,
        daoAddress: plugin.daoAddress,
      })
      await Models.Proposal.create({
        ...structuredClone(ProposalList[0]),
        id: undefined,
        transactionHash: '0xaa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66',
        proposalIndex: '99',
        incrementalId: 99,
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        network: plugin.network,
        blockTimestamp: proposal.blockTimestamp - 3600,
      } as any)
      await Models.Vote.create({
        ...structuredClone(FakeVote),
        id: 'prior-vote',
        network: proposal.network,
        daoAddress: proposal.daoAddress,
        pluginAddress: proposal.pluginAddress,
        proposalIndex: '99',
        memberAddress: proposal.creatorAddress,
        blockTimestamp: proposal.blockTimestamp - 3600,
      })

      await FraudScan.scanProposal(proposal.id)

      let stored: any = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.creationScore).to.equal(0)
      expect(postStub.calledOnce).to.be.true
      expect(postStub.firstCall.args[0]).to.include('🔎 scanned')

      await castVote(proposal, proposal.creatorAddress)
      await FraudScan.scanProposal(proposal.id)

      // The quiet note is upgraded to the real alert, not to an "escalated" follow-up.
      expect(postStub.calledTwice).to.be.true
      expect(postStub.secondCall.args[0]).to.include('MEDIUM')
      expect(postStub.secondCall.args[0]).to.not.include('ESCALATED')
      stored = await Models.ProposalFinding.findOne({ id: proposal.id }).lean()
      expect(stored.score).to.equal(25)
      expect(stored.alertedAs).to.equal('alert')
    })
  })

  // The revised weights must keep every confirmed drain at high or critical as seen at creation.
  describe('shadow validation against the confirmed drains', () => {
    for (const drain of FraudulentProposalList as any[]) {
      it(`flags ${drain.name} while the voting window is still open`, async () => {
        await Models.Dao.create(drain.dao)
        await Models.Plugin.create(drain.plugin)
        const proposal = await Models.Proposal.create(drain.proposal)

        const finding: any = await FraudScan.scanProposal(proposal.id)

        expect(finding).to.not.equal(null)
        expect(finding.suppressedAs).to.equal(null)
        expect(finding.creationScore).to.be.at.least(45)
        expect(['high', 'critical']).to.include(finding.creationLevel)
      })
    }
  })
})
