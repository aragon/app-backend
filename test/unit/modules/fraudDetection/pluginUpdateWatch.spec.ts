import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import PluginUpdateWatch from '@modules/fraudDetection/pluginUpdateWatch'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import { EnumQueueName, type IPluginUpdate, type IWatchedPluginUpdate, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const PLUGIN = '0x1111111111111111111111111111111111111111'
const DAO = '0x2222222222222222222222222222222222222222'
const ALERT_ID = `${NetworksEnum.ethereumMainnet}-${PLUGIN}-1-2`

const RULE: IWatchedPluginUpdate = {
  type: 'multisig',
  from: 1,
  to: 2,
  level: 'critical',
  settledVersion: 2,
  followUp: 'check {plugin} on chain {chainId}',
}

const update = (overrides: Partial<IPluginUpdate> = {}): IPluginUpdate => ({
  network: NetworksEnum.ethereumMainnet,
  daoAddress: DAO,
  pluginAddress: PLUGIN,
  interfaceType: 'multisig',
  release: 1,
  fromBuild: 1,
  toBuild: 2,
  transactionHash: '0xabc',
  blockNumber: 123,
  ...overrides,
})

// Initialized version in the lowest byte of slot 0, with another flag set in the next byte.
const slotWithVersion = (version: number) => `0x${'0'.repeat(60)}01${version.toString(16).padStart(2, '0')}`

/** What the indexer and then the queue consumer do for one update. */
const queueAndRun = async (overrides: Partial<IPluginUpdate> = {}) => {
  const alert = await PluginUpdateWatch.queue(update(overrides))
  return alert ? await PluginUpdateWatch.run({ id: alert.id }) : null
}

const runError = async (overrides: Partial<IPluginUpdate> = {}) => {
  try {
    await queueAndRun(overrides)
  } catch (error: any) {
    return error
  }
  return null
}

const stored = async (id = ALERT_ID): Promise<any> => Models.PluginUpdateAlert.findOne({ id }).lean()

/** Saves a pending alert as if the indexer did it `ageMs` ago and its message never arrived. */
const seedPending = async (ageMs: number, overrides: Partial<IPluginUpdate> = {}, fields: Record<string, any> = {}) => {
  const data = update(overrides)
  const id = Models.PluginUpdateAlert.getEntityId(data)
  await Models.PluginUpdateAlert.createLog({ id, ...data })
  await Models.PluginUpdateAlert.collection.updateOne(
    { id },
    { $set: { createdAt: new Date(Date.now() - ageMs), ...fields } },
  )
  return id
}

describe('Module: fraudDetection/pluginUpdateWatch', () => {
  let sandbox: sinon.SinonSandbox
  let sendStub: sinon.SinonStub
  let publishStub: sinon.SinonStub
  let getStorage: sinon.SinonStub
  let warnStub: sinon.SinonStub
  let errorStub: sinon.SinonStub
  let watchedStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    warnStub = sandbox.stub(logger, 'warn')
    errorStub = sandbox.stub(logger, 'error')
    watchedStub = sandbox.stub(config.FRAUD_SCAN, 'WATCHED_UPDATES').value(JSON.stringify([RULE]))
    sandbox.stub(TelegramModule, 'isConfigured').returns(true)
    sendStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
    publishStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    getStorage = sandbox.stub().resolves(slotWithVersion(1))
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('queue', () => {
    it('saves the update as a pending alert and publishes its id', async () => {
      await PluginUpdateWatch.queue(update())

      const alert = await stored()
      expect(alert.status).to.equal('pending')
      expect(alert.sentAt).to.equal(null)
      expect(alert.toBuild).to.equal(2)
      expect(publishStub.calledOnceWith(EnumQueueName.pluginUpdateWatch, { id: ALERT_ID, params: { id: ALERT_ID } })).to
        .be.true
    })

    it('keeps the pending alert when the publish fails', async () => {
      publishStub.rejects(new Error('broker down'))

      await PluginUpdateWatch.queue(update())
      await new Promise(resolve => setImmediate(resolve))

      expect((await stored()).status).to.equal('pending')
      expect(warnStub.calledWith('PluginUpdateWatch: publish failed, the sweep sends it later' as any)).to.be.true
    })

    it('does not wait for the broker', async () => {
      publishStub.returns(new Promise(() => {}))

      const outcome = await Promise.race([
        PluginUpdateWatch.queue(update()).then(() => 'done'),
        new Promise(resolve => setTimeout(() => resolve('stuck'), 1000)),
      ])

      expect(outcome).to.equal('done')
      expect((await stored()).status).to.equal('pending')
    })

    it('skips testnets', async () => {
      const result = await PluginUpdateWatch.queue(update({ network: NetworksEnum.ethereumSepolia }))

      expect(result).to.equal(null)
      expect(publishStub.notCalled).to.be.true
      expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(0)
    })

    it('does not touch an alert that was already sent when the update is queued again', async () => {
      await queueAndRun()
      await PluginUpdateWatch.queue(update({ transactionHash: '0xdef', blockNumber: 456 }))

      const alert = await stored()
      expect(alert.status).to.equal('sent')
      expect(alert.transactionHash).to.equal('0xabc')
      expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(1)
    })
  })

  describe('run', () => {
    it('sends a critical alert with the plugin, DAO, release, builds, tx, block and follow-up line', async () => {
      await queueAndRun()

      expect(sendStub.calledOnce).to.be.true
      const text: string = sendStub.firstCall.args[0]
      expect(text).to.include('CRITICAL')
      expect(text).to.include(`plugin ${PLUGIN} (multisig), release 1, build 1 → 2`)
      expect(text).to.include(`DAO ${DAO}`)
      expect(text).to.include('tx 0xabc | block 123')
      expect(text).to.include('initialized version: 1')
      expect(text).to.include(`<code>check ${PLUGIN} on chain 1</code>`)
      expect(getStorage.calledOnceWith(PLUGIN, 0)).to.be.true

      const alert = await stored()
      expect(alert.status).to.equal('sent')
      expect(alert.level).to.equal('critical')
      expect(alert.initializedVersion).to.equal(1)
      expect(alert.sentAt).to.not.equal(null)
    })

    it('alerts once per plugin when the same update is delivered again', async () => {
      await queueAndRun()
      await queueAndRun()

      expect(sendStub.calledOnce).to.be.true
    })

    it('does not alert again when a replay brings the same update with another tx', async () => {
      await queueAndRun()
      await queueAndRun({ transactionHash: '0xdef', blockNumber: 456 })

      expect(sendStub.calledOnce).to.be.true
      expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(1)
    })

    it('sends a note instead of a critical alert when the plugin is already at the settled version', async () => {
      getStorage.resolves(slotWithVersion(2))

      await queueAndRun()

      const text: string = sendStub.firstCall.args[0]
      expect(text).to.not.include('CRITICAL')
      expect(text).to.include('initialized version is already 2, nothing to do')
      expect(text).to.not.include('<code>')
      expect((await stored()).level).to.equal('low')
    })

    it('stays critical when the initialized version cannot be read', async () => {
      getStorage.rejects(new Error('rpc down'))

      await queueAndRun()

      const text: string = sendStub.firstCall.args[0]
      expect(text).to.include('CRITICAL')
      expect(text).to.include('initialized version: could not read')
    })

    it('closes an update that no rule watches without sending', async () => {
      await queueAndRun({ interfaceType: 'admin' })
      await queueAndRun({ fromBuild: 2, toBuild: 3 })

      expect(sendStub.notCalled).to.be.true
      expect(await Models.PluginUpdateAlert.countDocuments({ status: 'unwatched' })).to.equal(2)
    })

    it('matches on the new build alone when the previous build is unknown', async () => {
      await queueAndRun({ fromBuild: null })

      expect(sendStub.calledOnce).to.be.true
      expect(sendStub.firstCall.args[0]).to.include('build ? → 2')
    })

    it('leaves the alert pending and sends nothing while Telegram is not configured', async () => {
      ;(TelegramModule.isConfigured as sinon.SinonStub).returns(false)

      await queueAndRun()

      expect(sendStub.notCalled).to.be.true
      const alert = await stored()
      expect(alert.status).to.equal('pending')
      expect(alert.claimedAt).to.equal(null)
    })

    it('returns quietly when the alert is not saved', async () => {
      const result = await PluginUpdateWatch.run({ id: 'missing' })

      expect(result).to.equal(null)
      expect(sendStub.notCalled).to.be.true
    })
  })

  describe('delivery', () => {
    it('throws and releases the claim when Telegram fails, so the queue retry can send it', async () => {
      sendStub.onFirstCall().rejects(new Error('telegram down'))

      const error = await runError()

      expect(error?.message).to.equal('telegram down')
      let alert = await stored()
      expect(alert.claimedAt).to.equal(null)
      expect(alert.status).to.equal('pending')

      await PluginUpdateWatch.run({ id: ALERT_ID })

      expect(sendStub.calledTwice).to.be.true
      alert = await stored()
      expect(alert.status).to.equal('sent')
    })

    it('throws before claiming when the DAO lookup fails', async () => {
      sandbox.stub(Models.Dao, 'findOne').throws(new Error('mongo down'))

      const error = await runError()

      expect(error?.message).to.equal('mongo down')
      expect(sendStub.notCalled).to.be.true
      expect((await stored()).claimedAt).to.equal(null)
    })

    it('takes over a claim left by a delivery that died before sending', async () => {
      await seedPending(0, {}, { claimedAt: new Date(Date.now() - 2 * 60 * 1000) })

      await PluginUpdateWatch.run({ id: ALERT_ID })

      expect(sendStub.calledOnce).to.be.true
    })

    it('throws without sending while another delivery holds a live claim', async () => {
      await seedPending(0, {}, { claimedAt: new Date() })

      let error: any = null
      try {
        await PluginUpdateWatch.run({ id: ALERT_ID })
      } catch (e) {
        error = e
      }

      expect(error?.message).to.include('is claimed by another delivery')
      expect(sendStub.notCalled).to.be.true
    })
  })

  describe('sweep', () => {
    const TEN_MINUTES = 10 * 60 * 1000

    it('delivers a pending alert whose message never arrived', async () => {
      await seedPending(TEN_MINUTES)

      await PluginUpdateWatch.sweep()

      expect(sendStub.calledOnce).to.be.true
      expect((await stored()).status).to.equal('sent')
    })

    it('skips alerts with a live claim, alerts already sent, and alerts the queue may still be sending', async () => {
      const claimed = await seedPending(
        TEN_MINUTES,
        { pluginAddress: '0x3333333333333333333333333333333333333333' },
        {
          claimedAt: new Date(),
        },
      )
      const sent = await seedPending(
        TEN_MINUTES,
        { pluginAddress: '0x4444444444444444444444444444444444444444' },
        {
          status: 'sent',
          sentAt: new Date(),
        },
      )
      const fresh = await seedPending(60 * 1000)

      await PluginUpdateWatch.sweep()

      expect(sendStub.notCalled).to.be.true
      expect((await stored(claimed)).status).to.equal('pending')
      expect((await stored(sent)).status).to.equal('sent')
      expect((await stored(fresh)).status).to.equal('pending')
    })

    it('closes an unwatched alert without sending', async () => {
      await seedPending(TEN_MINUTES, { interfaceType: 'admin' })

      await PluginUpdateWatch.sweep()

      expect(sendStub.notCalled).to.be.true
      expect((await stored()).status).to.equal('unwatched')
    })

    it('goes on with the next alert when one delivery fails', async () => {
      const first = await seedPending(TEN_MINUTES + 1000, {
        pluginAddress: '0x5555555555555555555555555555555555555555',
      })
      const second = await seedPending(TEN_MINUTES)
      sendStub.onFirstCall().rejects(new Error('telegram down'))

      await PluginUpdateWatch.sweep()

      expect(sendStub.calledTwice).to.be.true
      expect((await stored(first)).status).to.equal('pending')
      expect((await stored(second)).status).to.equal('sent')
    })

    it('does nothing while Telegram is not configured', async () => {
      ;(TelegramModule.isConfigured as sinon.SinonStub).returns(false)
      await seedPending(TEN_MINUTES)

      await PluginUpdateWatch.sweep()

      expect(sendStub.notCalled).to.be.true
      expect((await stored()).status).to.equal('pending')
    })
  })

  describe('release', () => {
    it('keeps alerts for the same build on two releases apart', async () => {
      await queueAndRun()
      await queueAndRun({ release: 2 })

      expect(sendStub.calledTwice).to.be.true
      expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(2)
    })

    it('does not match a rule written for another release', async () => {
      watchedStub.value(JSON.stringify([{ ...RULE, release: 2 }]))

      await queueAndRun()

      expect(sendStub.notCalled).to.be.true
    })
  })

  describe('FRAUD_SCAN_WATCHED_UPDATES', () => {
    it('watches nothing when it is empty', () => {
      watchedStub.value('')

      expect(PluginUpdateWatch.rules()).to.deep.equal([])
      expect(errorStub.notCalled).to.be.true
    })

    it('reads a JSON list of rules', () => {
      expect(PluginUpdateWatch.rules()).to.deep.equal([RULE])
    })

    it('watches nothing and logs an error when it is not a JSON list', async () => {
      watchedStub.value('{not json')

      await queueAndRun()

      expect(sendStub.notCalled).to.be.true
      expect(
        errorStub.calledWith(
          'PluginUpdateWatch: FRAUD_SCAN_WATCHED_UPDATES is not a JSON list, nothing is watched' as any,
        ),
      ).to.be.true
    })

    it('treats a JSON value that is not a list as invalid', () => {
      watchedStub.value(JSON.stringify(RULE))

      expect(PluginUpdateWatch.rules()).to.deep.equal([])
      expect(errorStub.calledOnce).to.be.true
    })

    it('drops a rule without a level, logs it, and does not alert', async () => {
      const { level: _level, ...noLevel } = RULE
      watchedStub.value(JSON.stringify([noLevel]))

      await queueAndRun()

      expect(sendStub.notCalled).to.be.true
      expect(
        errorStub.calledWith(
          'PluginUpdateWatch: dropped watched update rules with a bad shape' as any,
          sinon.match.any,
        ),
      ).to.be.true
    })

    it('drops rules with numbers written as strings or an unknown level, and keeps the good ones', () => {
      const bad = [
        { ...RULE, to: '2' },
        { ...RULE, settledVersion: '2' },
        { ...RULE, level: 'urgent' },
        { ...RULE, release: '1' },
      ]
      watchedStub.value(JSON.stringify([...bad, RULE]))

      expect(PluginUpdateWatch.rules()).to.deep.equal([RULE])
      const call = errorStub
        .getCalls()
        .find(c => c.args[0] === ('PluginUpdateWatch: dropped watched update rules with a bad shape' as any))
      expect((call?.args[1] as any)?.dropped).to.deep.equal([0, 1, 2, 3])
    })

    it('accepts a rule without from, release or followUp', () => {
      const minimal = { type: 'multisig', to: 2, level: 'critical', settledVersion: 2 }
      watchedStub.value(JSON.stringify([minimal]))

      expect(PluginUpdateWatch.rules()).to.deep.equal([minimal])
    })
  })
})
