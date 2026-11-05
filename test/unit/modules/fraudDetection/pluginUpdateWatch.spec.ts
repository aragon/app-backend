import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import PluginUpdateWatch from '@modules/fraudDetection/pluginUpdateWatch'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import { type IQueuePluginUpdateWatch, type IWatchedPluginUpdate, NetworksEnum } from '@types'
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

const update = (overrides: Partial<IQueuePluginUpdateWatch> = {}): IQueuePluginUpdateWatch => ({
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

const runError = async (params: IQueuePluginUpdateWatch) => {
  try {
    await PluginUpdateWatch.run(params)
  } catch (error: any) {
    return error
  }
  return null
}

describe('Module: fraudDetection/pluginUpdateWatch', () => {
  let sandbox: sinon.SinonSandbox
  let sendStub: sinon.SinonStub
  let getStorage: sinon.SinonStub
  let errorStub: sinon.SinonStub
  let watchedStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    errorStub = sandbox.stub(logger, 'error')
    watchedStub = sandbox.stub(config.FRAUD_SCAN, 'WATCHED_UPDATES').value(JSON.stringify([RULE]))
    sandbox.stub(TelegramModule, 'isConfigured').returns(true)
    sendStub = sandbox.stub(TelegramModule, 'sendMessage').resolves()
    getStorage = sandbox.stub().resolves(slotWithVersion(1))
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('sends a critical alert with the plugin, DAO, release, builds, tx, block and follow-up line', async () => {
    await PluginUpdateWatch.run(update())

    expect(sendStub.calledOnce).to.be.true
    const text: string = sendStub.firstCall.args[0]
    expect(text).to.include('CRITICAL')
    expect(text).to.include(`plugin ${PLUGIN} (multisig), release 1, build 1 → 2`)
    expect(text).to.include(`DAO ${DAO}`)
    expect(text).to.include('tx 0xabc | block 123')
    expect(text).to.include('initialized version: 1')
    expect(text).to.include(`<code>check ${PLUGIN} on chain 1</code>`)
    expect(getStorage.calledOnceWith(PLUGIN, 0)).to.be.true

    const stored: any = await Models.PluginUpdateAlert.findOne({ id: ALERT_ID }).lean()
    expect(stored.level).to.equal('critical')
    expect(stored.initializedVersion).to.equal(1)
    expect(stored.sentAt).to.not.equal(null)
  })

  it('alerts once per plugin when the same update is delivered again', async () => {
    await PluginUpdateWatch.run(update())
    await PluginUpdateWatch.run(update())

    expect(sendStub.calledOnce).to.be.true
  })

  it('does not alert again when a replay brings the same update with another tx', async () => {
    await PluginUpdateWatch.run(update())
    await PluginUpdateWatch.run(update({ transactionHash: '0xdef', blockNumber: 456 }))

    expect(sendStub.calledOnce).to.be.true
    expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(1)
  })

  it('sends a note instead of a critical alert when the plugin is already at the settled version', async () => {
    getStorage.resolves(slotWithVersion(2))

    await PluginUpdateWatch.run(update())

    const text: string = sendStub.firstCall.args[0]
    expect(text).to.not.include('CRITICAL')
    expect(text).to.include('initialized version is already 2, nothing to do')
    expect(text).to.not.include('<code>')
    const stored: any = await Models.PluginUpdateAlert.findOne({}).lean()
    expect(stored.level).to.equal('low')
  })

  it('stays critical when the initialized version cannot be read', async () => {
    getStorage.rejects(new Error('rpc down'))

    await PluginUpdateWatch.run(update())

    const text: string = sendStub.firstCall.args[0]
    expect(text).to.include('CRITICAL')
    expect(text).to.include('initialized version: could not read')
  })

  it('skips testnets', async () => {
    const result = await PluginUpdateWatch.run(update({ network: NetworksEnum.ethereumSepolia }))

    expect(result).to.equal(null)
    expect(sendStub.notCalled).to.be.true
    expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(0)
  })

  it('does not alert on an update that no rule watches', async () => {
    await PluginUpdateWatch.run(update({ interfaceType: 'admin' }))
    await PluginUpdateWatch.run(update({ fromBuild: 2, toBuild: 3 }))

    expect(sendStub.notCalled).to.be.true
    expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(0)
  })

  it('matches on the new build alone when the previous build is unknown', async () => {
    await PluginUpdateWatch.run(update({ fromBuild: null }))

    expect(sendStub.calledOnce).to.be.true
    expect(sendStub.firstCall.args[0]).to.include('build ? → 2')
  })

  it('stores nothing as sent and sends nothing while Telegram is not configured', async () => {
    ;(TelegramModule.isConfigured as sinon.SinonStub).returns(false)

    await PluginUpdateWatch.run(update())

    expect(sendStub.notCalled).to.be.true
    const stored: any = await Models.PluginUpdateAlert.findOne({ id: ALERT_ID }).lean()
    expect(stored.sentAt).to.equal(null)
    expect(stored.claimedAt).to.equal(null)
  })

  describe('delivery', () => {
    it('throws and releases the claim when Telegram fails, so the queue retry can send it', async () => {
      sendStub.onFirstCall().rejects(new Error('telegram down'))

      const error = await runError(update())

      expect(error?.message).to.equal('telegram down')
      const stored: any = await Models.PluginUpdateAlert.findOne({ id: ALERT_ID }).lean()
      expect(stored.claimedAt).to.equal(null)
      expect(stored.sentAt).to.equal(null)

      await PluginUpdateWatch.run(update())

      expect(sendStub.calledTwice).to.be.true
      const sent: any = await Models.PluginUpdateAlert.findOne({ id: ALERT_ID }).lean()
      expect(sent.sentAt).to.not.equal(null)
    })

    it('throws before claiming when the DAO lookup fails', async () => {
      sandbox.stub(Models.Dao, 'findOne').throws(new Error('mongo down'))

      const error = await runError(update())

      expect(error?.message).to.equal('mongo down')
      expect(sendStub.notCalled).to.be.true
      const stored: any = await Models.PluginUpdateAlert.findOne({ id: ALERT_ID }).lean()
      expect(stored.claimedAt).to.equal(null)
    })

    it('takes over a claim left by a delivery that died before sending', async () => {
      await Models.PluginUpdateAlert.createLog({ id: ALERT_ID, ...update() })
      await Models.PluginUpdateAlert.updateOne({ id: ALERT_ID }, { claimedAt: new Date(Date.now() - 2 * 60 * 1000) })

      await PluginUpdateWatch.run(update())

      expect(sendStub.calledOnce).to.be.true
    })

    it('throws without sending while another delivery holds a live claim', async () => {
      await Models.PluginUpdateAlert.createLog({ id: ALERT_ID, ...update() })
      await Models.PluginUpdateAlert.updateOne({ id: ALERT_ID }, { claimedAt: new Date() })

      const error = await runError(update())

      expect(error?.message).to.include('is claimed by another delivery')
      expect(sendStub.notCalled).to.be.true
    })
  })

  describe('release', () => {
    it('keeps alerts for the same build on two releases apart', async () => {
      await PluginUpdateWatch.run(update())
      await PluginUpdateWatch.run(update({ release: 2 }))

      expect(sendStub.calledTwice).to.be.true
      expect(await Models.PluginUpdateAlert.countDocuments({})).to.equal(2)
    })

    it('does not match a rule written for another release', async () => {
      watchedStub.value(JSON.stringify([{ ...RULE, release: 2 }]))

      await PluginUpdateWatch.run(update())

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

      await PluginUpdateWatch.run(update())

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

      await PluginUpdateWatch.run(update())

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
