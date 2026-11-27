import config, { TENDERLY_RESPONSE_MARGIN_MS } from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { simulateExecution } from '@modules/fraudDetection/simulate'
import TenderlyModule from '@modules/tenderly'
import TenderlyTransport from '@modules/tenderly/transport'
import {
  ISimulationStatus,
  ITenderlyCallCacheKind,
  ITenderlyOperation,
  type ITenderlyPayload,
  type ITenderlySendContext,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

// Pinned to an exact hour, so every send in a test lands in the same budget bucket. In the future,
// because the test DB has the TTL index and would purge a bucket whose `purgeAt` is already past.
const NOW = Date.UTC(2030, 0, 1, 12, 0, 0)
const HOUR = '2030-01-01T12'
const DAO = '0x1111111111111111111111111111111111111111'
const OTHER_DAO = '0x2222222222222222222222222222222222222222'
const ACCESS_KEY = 'secret-access-key'
const SCOPE = `budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${DAO}|${HOUR}`

const ok = { simulation: { id: 'sim-1' }, transaction: { status: true } }

const payload = (input = '0xabcdef'): ITenderlyPayload => ({
  network_id: '1',
  from: DAO,
  to: DAO,
  input,
  gas: 8000000,
  gas_price: '0',
  value: '0',
  save: true,
})

const context = (overrides: Partial<ITenderlySendContext> = {}): ITenderlySendContext =>
  ({
    operation: ITenderlyOperation.pluginActions,
    network: NetworksEnum.ethereumMainnet,
    daoAddress: DAO,
    deadlineAt: NOW + 30_000,
    ...overrides,
  }) as ITenderlySendContext

const count = async (id: string) => (await Models.TenderlyCallCache.findOne({ id }))?.count ?? 0
const globalCount = () => count(`budget|global|${HOUR}`)
const budgetDocs = () => Models.TenderlyCallCache.countDocuments({ kind: ITenderlyCallCacheKind.budget })

describe('Module: tenderly/transport', () => {
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers
  let axiosPost: sinon.SinonStub
  let loggerWarn: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.useFakeTimers({ now: NOW, toFake: ['Date'] })
    loggerWarn = sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'info')

    sandbox.stub(config.TENDERLY, 'PROJECT').value('project')
    sandbox.stub(config.TENDERLY, 'USER').value('user')
    sandbox.stub(config.TENDERLY, 'ACCESS_KEY').value(ACCESS_KEY)
    sandbox.stub(config.TENDERLY, 'MIN_TIME').value(0)
    BottleneckModule.tenderlyLimiter = null

    axiosPost = sandbox.stub(axios, 'post').resolves({ data: ok })
  })

  afterEach(() => {
    BottleneckModule.tenderlyLimiter = null
    sandbox?.restore()
  })

  const simulate = (ctx: ITenderlySendContext = context(), input?: string) =>
    TenderlyTransport.simulate(payload(input), ctx)

  describe('deadline', () => {
    it('gives the request the API timeout minus the reply margin, which is shorter than the queue timeout', () => {
      expect(TenderlyTransport.deadlineAt(NOW)).to.equal(
        NOW + config.SERVICES.ARAGON_API.TIMEOUT * 1000 - TENDERLY_RESPONSE_MARGIN_MS,
      )
      expect(config.SERVICES.ARAGON_API.TIMEOUT * 1000).to.be.lessThan(config.RABBITMQ.TIMEOUT)
    })

    it('answers 503 and sends nothing when the DAO check outlasts the deadline', async () => {
      const consume = Models.TenderlyCallCache.consumeBudget.bind(Models.TenderlyCallCache)
      sandbox.stub(Models.TenderlyCallCache, 'consumeBudget').callsFake(async (id, limit, now) => {
        const consumed = await consume(id, limit, now)
        clock.tick(31_000)
        return consumed
      })

      const thrown: any = await simulate().catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)
      expect(axiosPost.called).to.be.false
      expect(await count(SCOPE)).to.equal(1)
      expect(await globalCount()).to.equal(0)
    })

    it('refuses a request sent 31 seconds ago before any DB or HTTP work', async () => {
      expect(() => TenderlyTransport.deadlineAt(NOW - 31_000)).to.throw('tooBusy')

      const thrown: any = await simulate(context({ deadlineAt: NOW - 1_000 })).catch(error => error)

      expect(thrown.status).to.equal(503)
      expect(axiosPost.called).to.be.false
      expect(await budgetDocs()).to.equal(0)
    })

    it('checks the deadline again when the queue frees the job, before charging anything', async () => {
      let release: () => void = () => {}
      let started: () => void = () => {}
      const firstStarted = new Promise<void>(resolve => (started = resolve))
      axiosPost.onFirstCall().callsFake(() => {
        started()
        return new Promise(resolve => (release = () => resolve({ data: ok })))
      })

      const first = simulate()
      await firstStarted
      const second = simulate().catch(error => error)

      clock.tick(31_000)
      release()

      await first
      const thrown: any = await second

      expect(thrown.message).to.equal('tooBusy')
      expect(axiosPost.calledOnce).to.be.true
      expect(await globalCount()).to.equal(1)
    })
  })

  describe('config', () => {
    it('answers 503 and charges nothing when the access key is empty', async () => {
      sandbox.stub(config.TENDERLY, 'ACCESS_KEY').value('')

      const thrown: any = await simulate().catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)
      expect(axiosPost.called).to.be.false
      expect(await budgetDocs()).to.equal(0)
    })
  })

  describe('input', () => {
    it('refuses input that is not hex before any charge or HTTP', async () => {
      const thrown: any = await simulate(context(), '0xzz').catch(error => error)

      expect(thrown.message).to.equal('badSimulationRequest')
      expect(axiosPost.called).to.be.false
      expect(await budgetDocs()).to.equal(0)
    })
  })

  describe('budget', () => {
    it('does not charge the budget for fraud detection', async () => {
      const facts = await simulateExecution({
        actions: [{ to: DAO, value: '0', data: '0x' }],
        daoAddress: DAO,
        pluginAddress: OTHER_DAO,
        proposalId: 'proposal-1',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 25_772_694,
      })

      expect(facts.status).to.equal('noEffect')
      expect(await budgetDocs()).to.equal(0)
      expect(axiosPost.firstCall.args[0]).to.match(/\/simulate$/)
      expect(axiosPost.firstCall.args[1].block_number).to.equal(25_772_694)
    })

    it('charges the DAO bucket and the API-wide bucket once per send', async () => {
      await simulate()

      expect(await count(SCOPE)).to.equal(1)
      expect(await globalCount()).to.equal(1)
      expect(axiosPost.calledOnce).to.be.true
    })

    it('lets 300 sends through across operations, networks and DAOs, then refuses the 301st of any kind', async () => {
      const operations = [ITenderlyOperation.pluginActions, ITenderlyOperation.dispatch, ITenderlyOperation.proposal]
      const networks = [NetworksEnum.ethereumMainnet, NetworksEnum.baseMainnet]
      const daos = [1, 2, 3, 4, 5].map(n => `0x${String(n).repeat(40)}`)

      for (const operation of operations) {
        for (const network of networks) {
          for (const daoAddress of daos) {
            for (let i = 0; i < 10; i++) await simulate(context({ operation, network, daoAddress } as any))
          }
        }
      }

      const thrown: any = await simulate(
        context({ operation: ITenderlyOperation.directExecute, daoAddress: OTHER_DAO } as any),
      ).catch(error => error)

      expect(axiosPost.callCount).to.equal(300)
      expect(thrown.message).to.equal('simulationBudgetExhausted')
      expect(thrown.status).to.equal(429)
      expect(await globalCount()).to.equal(300)
    })

    it('lets 20 sends through for one operation, network and DAO, then refuses the 21st while another DAO still sends', async () => {
      for (let i = 0; i < 20; i++) await simulate()

      const thrown: any = await simulate().catch(error => error)
      await simulate(context({ daoAddress: OTHER_DAO }))
      await simulate(context({ operation: ITenderlyOperation.dispatch } as any))

      expect(thrown.message).to.equal('simulationBudgetExhausted')
      expect(thrown.status).to.equal(429)
      expect(await count(SCOPE)).to.equal(20)
      expect(axiosPost.callCount).to.equal(22)
    })

    it('shares the migrated gas counter: 299 counted gas runs leave room for exactly one plugin simulate', async () => {
      await Models.TenderlyCallCache.create({
        id: `budget|global|${HOUR}`,
        kind: ITenderlyCallCacheKind.budget,
        count: 299,
        purgeAt: new Date(NOW + 2 * 60 * 60 * 1000),
      })

      await simulate()
      const thrown: any = await simulate(context({ daoAddress: OTHER_DAO })).catch(error => error)

      expect(axiosPost.calledOnce).to.be.true
      expect(thrown.message).to.equal('simulationBudgetExhausted')
      expect(await globalCount()).to.equal(300)
    })

    it('answers 503 and sends nothing when the counter store fails', async () => {
      sandbox.stub(logger, 'error')
      sandbox.stub(Models.TenderlyCallCache, 'consumeBudget').rejects(new Error('mongo down'))

      const thrown: any = await simulate().catch(error => error)

      expect(thrown.message).to.equal('simulationBudgetCheckFailed')
      expect(thrown.status).to.equal(503)
      expect(axiosPost.called).to.be.false
    })
  })

  describe('queue', () => {
    it('drops the 9th waiting job with 503 and no charge, then sends again once the queue drains', async () => {
      let release: () => void = () => {}
      let started: () => void = () => {}
      const firstStarted = new Promise<void>(resolve => (started = resolve))
      axiosPost.onFirstCall().callsFake(() => {
        started()
        return new Promise(resolve => (release = () => resolve({ data: ok })))
      })

      const running = simulate()
      await firstStarted
      const waiting = Array.from({ length: 8 }, () => simulate())
      const dropped: any = await simulate().catch(error => error)

      expect(dropped.message).to.equal('tooBusy')
      expect(dropped.status).to.equal(503)
      expect(await globalCount()).to.equal(1)

      release()
      await Promise.all([running, ...waiting])
      await simulate()

      expect(axiosPost.callCount).to.equal(10)
      expect(await globalCount()).to.equal(10)
    })
  })

  describe('http', () => {
    it('sends once with the key in the header and the time left as the timeout', async () => {
      await simulate()

      const [url, body, options] = axiosPost.firstCall.args
      expect(url).to.equal('https://api.tenderly.co/api/v1/account/user/project/project/simulate')
      expect(body).to.deep.equal(payload())
      expect(options).to.deep.include({
        headers: { 'X-Access-Key': ACCESS_KEY, 'Content-Type': 'application/json' },
        timeout: 30_000,
        maxRedirects: 0,
      })
    })

    it('charges exactly one unit and answers 502 when the HTTP call times out', async () => {
      axiosPost.rejects(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))

      const thrown: any = await simulate().catch(error => error)

      expect(thrown.message).to.equal('simulationFailed')
      expect(thrown.status).to.equal(502)
      expect(axiosPost.calledOnce).to.be.true
      expect(await globalCount()).to.equal(1)
      expect(await count(SCOPE)).to.equal(1)
    })

    it('answers 502 when the provider body carries no simulation id', async () => {
      axiosPost.resolves({ data: { transaction: { status: true } } })

      await expect(simulate()).to.be.rejectedWith('simulationFailed')
      expect(await globalCount()).to.equal(1)
    })

    it('logs the provider status code and never the key', async () => {
      axiosPost.rejects(
        Object.assign(new Error('Request failed with status code 401'), {
          response: { status: 401 },
          config: { headers: { 'X-Access-Key': ACCESS_KEY } },
        }),
      )

      await expect(simulate()).to.be.rejectedWith('simulationFailed')

      expect(loggerWarn.calledOnce).to.be.true
      expect(loggerWarn.firstCall.args[1]).to.include({ status: 401 })
      expect(JSON.stringify(loggerWarn.firstCall.args)).to.not.include(ACCESS_KEY)
    })
  })

  describe('share', () => {
    it('returns the share link and charges nothing', async () => {
      axiosPost.resolves({ data: { share_url: 'https://dashboard.tenderly.co/shared/simulation/sim-1' } })

      const url = await TenderlyTransport.share('sim-1', NOW + 30_000)

      expect(url).to.equal('https://dashboard.tenderly.co/shared/simulation/sim-1')
      expect(axiosPost.firstCall.args[0]).to.match(/\/simulations\/sim-1\/share$/)
      expect(await budgetDocs()).to.equal(0)
    })

    it('keeps the fallback link when sharing fails', async () => {
      axiosPost.rejects(new Error('boom'))

      expect(await TenderlyTransport.share('sim-1', NOW + 30_000)).to.equal(
        'https://www.tdly.co/shared/simulation/sim-1',
      )
    })

    it('does not share past the deadline', async () => {
      expect(await TenderlyTransport.share('sim-1', NOW - 1)).to.equal('https://www.tdly.co/shared/simulation/sim-1')
      expect(axiosPost.called).to.be.false
    })

    it('keeps the simulation result when sharing rejects', async () => {
      axiosPost.onSecondCall().rejects(new Error('boom'))

      const result = await TenderlyModule.simulate(
        { to: DAO, data: '0xabcdef', from: DAO },
        NetworksEnum.ethereumMainnet,
        context(),
      )

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://www.tdly.co/shared/simulation/sim-1')
      expect(await globalCount()).to.equal(1)
    })
  })
})
