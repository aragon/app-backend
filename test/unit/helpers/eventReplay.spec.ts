import '@test/environment'
import EventReplayHelper from '@helpers/eventReplay'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import IndexerEventConfig from '@services/aragon-indexer/configIndexer'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: EventReplay', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const txHash = '0xf4c51e69d681e39d1bf60a446b2fbab6da2596715f91d599a732d2eeeaa3f71f'

  // the first configured event — gives us a real topic + handler to match against
  const firstSetting = (IndexerEventConfig as any[])[0]
  const knownTopic = Array.isArray(firstSetting.topic) ? firstSetting.topic[0] : firstSetting.topic
  const knownHandler = firstSetting.config[0].handler

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('parseLogsByConfig', () => {
    it('matches a configured topic and returns its handler and parsed info', () => {
      const fakeEvent = { name: firstSetting.event, args: [] } as any
      sandbox.stub(Web3Utils, 'parseLog').returns(fakeEvent)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ eventName: firstSetting.event, network } as any)

      const log = { topics: [knownTopic], address: '0xabc', index: 0 } as any
      const parsed = EventReplayHelper.parseLogsByConfig([log], network)

      expect(parsed).to.have.lengthOf(1)
      expect(parsed[0].handler).to.equal(knownHandler)
      expect(parsed[0].event).to.equal(fakeEvent)
      expect(parsed[0].info.eventName).to.equal(firstSetting.event)
    })

    it('skips logs whose topic is not in the indexer config', () => {
      const parseLogStub = sandbox.stub(Web3Utils, 'parseLog')

      const log = { topics: ['0xdeadbeef'], address: '0xabc', index: 0 } as any
      const parsed = EventReplayHelper.parseLogsByConfig([log], network)

      expect(parsed).to.have.lengthOf(0)
      expect(parseLogStub.called).to.be.false
    })

    it('skips a matched topic when no abi in the config can parse the log', () => {
      sandbox.stub(Web3Utils, 'parseLog').returns(null)
      const parseInfoStub = sandbox.stub(Web3Utils, 'parseInfoLog')

      const log = { topics: [knownTopic], address: '0xabc', index: 0 } as any
      const parsed = EventReplayHelper.parseLogsByConfig([log], network)

      expect(parsed).to.have.lengthOf(0)
      expect(parseInfoStub.called).to.be.false
    })
  })

  describe('handleEventsFromTxHash', () => {
    it('returns found:false when the receipt is missing', async () => {
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const result = await EventReplayHelper.handleEventsFromTxHash(txHash, network)

      expect(result).to.deep.equal({ txHash, network, found: false, matched: [], handled: 0, failed: 0 })
    })

    it('dispatches each parsed event to its handler in log order and counts the results', async () => {
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [
          { index: 9, topics: ['0x9'] },
          { index: 2, topics: ['0x2'] },
        ],
      } as any)

      const firstHandler = sandbox.stub().resolves()
      const secondHandler = sandbox.stub().resolves()
      sandbox.stub(EventReplayHelper, 'parseLogsByConfig').returns([
        { event: {} as any, handler: secondHandler, info: { eventName: 'EventLow', network } as any },
        { event: {} as any, handler: firstHandler, info: { eventName: 'EventHigh', network } as any },
      ])

      const result = await EventReplayHelper.handleEventsFromTxHash(txHash, network)

      expect(firstHandler.calledOnce).to.be.true
      expect(secondHandler.calledOnce).to.be.true
      expect(result).to.deep.equal({
        txHash,
        network,
        found: true,
        matched: ['EventLow', 'EventHigh'],
        handled: 2,
        failed: 0,
      })
    })

    it('isolates a failing handler and keeps processing the rest', async () => {
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [{ index: 0, topics: ['0x0'] }] } as any)

      const okHandler = sandbox.stub().resolves()
      const failingHandler = sandbox.stub().rejects(new Error('handler boom'))
      sandbox.stub(EventReplayHelper, 'parseLogsByConfig').returns([
        { event: {} as any, handler: failingHandler, info: { eventName: 'Boom', network } as any },
        { event: {} as any, handler: okHandler, info: { eventName: 'Ok', network } as any },
      ])

      const result = await EventReplayHelper.handleEventsFromTxHash(txHash, network)

      expect(okHandler.calledOnce).to.be.true
      expect(result.found).to.be.true
      expect(result.handled).to.equal(1)
      expect(result.failed).to.equal(1)
    })
  })
})
