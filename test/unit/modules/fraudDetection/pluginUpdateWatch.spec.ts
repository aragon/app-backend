import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import PluginUpdateWatch from '@modules/fraudDetection/pluginUpdateWatch'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import { EnumQueueName, type IQueuePluginUpdateWatch, type IWatchedPluginUpdate, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const PLUGIN = '0x1111111111111111111111111111111111111111'
const DAO = '0x2222222222222222222222222222222222222222'

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
  fromBuild: 1,
  toBuild: 2,
  transactionHash: '0xabc',
  blockNumber: 123,
  ...overrides,
})

// Initialized version in the lowest byte of slot 0, with another flag set in the next byte.
const slotWithVersion = (version: number) => `0x${'0'.repeat(60)}01${version.toString(16).padStart(2, '0')}`

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

  it('sends a critical alert with the plugin, DAO, builds, tx, block and follow-up line', async () => {
    await PluginUpdateWatch.run(update())

    expect(sendStub.calledOnce).to.be.true
    const text: string = sendStub.firstCall.args[0]
    expect(text).to.include('CRITICAL')
    expect(text).to.include(`plugin ${PLUGIN} (multisig), build 1 → 2`)
    expect(text).to.include(`DAO ${DAO}`)
    expect(text).to.include('tx 0xabc | block 123')
    expect(text).to.include('initialized version: 1')
    expect(text).to.include(`<code>check ${PLUGIN} on chain 1</code>`)
    expect(getStorage.calledOnceWith(PLUGIN, 0)).to.be.true

    const stored: any = await Models.PluginUpdateAlert.findOne({
      id: `${NetworksEnum.ethereumMainnet}-${PLUGIN}-2`,
    }).lean()
    expect(stored.level).to.equal('critical')
    expect(stored.initializedVersion).to.equal(1)
    expect(stored.alertedAt).to.not.equal(null)
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

  it('releases the claim and re-queues the job when Telegram fails', async () => {
    sendStub.onFirstCall().rejects(new Error('telegram down'))
    const delayedStub = sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()

    await PluginUpdateWatch.run(update())

    const stored: any = await Models.PluginUpdateAlert.findOne({}).lean()
    expect(stored.alertedAt).to.equal(null)
    expect(stored.alertAttempts).to.equal(1)
    expect(delayedStub.calledOnce).to.be.true
    expect(delayedStub.firstCall.args[0]).to.equal(EnumQueueName.pluginUpdateWatch)

    await PluginUpdateWatch.run(update())

    expect(sendStub.calledTwice).to.be.true
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
  })
})
