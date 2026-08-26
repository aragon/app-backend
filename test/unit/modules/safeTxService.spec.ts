import config from '@config'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { SafeReadError } from '@modules/safe/safeError'
import { ISafeErrorCode, NetworksEnum } from '@types'
import axios from 'axios'
import Bottleneck from 'bottleneck'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'

type GetStub = sinon.SinonStub

const axiosError = (status?: number, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`HTTP ${String(status)}`), {
    isAxiosError: true,
    response: status == null ? undefined : { status, headers },
  })

describe('Module: safeTxService', () => {
  let sandbox: SinonSandbox

  const loadClient = (getStub: GetStub, limiter = { schedule: (fn: () => unknown) => fn() }) => {
    sandbox.stub(axios, 'create').returns({ get: getStub } as never)
    sandbox.stub(BottleneckModule, 'getSafeApiLimiter').returns(limiter as never)

    return proxyquire.noCallThru().noPreserveCache()('@modules/safeTxService', {
      '@helpers/retryRequest': {
        retryRequest: async <T>(fn: () => Promise<T>, options?: { skipRetry?: (error: unknown) => boolean }) => {
          try {
            return await fn()
          } catch (error) {
            options?.skipRetry?.(error)
            throw error
          }
        },
      },
    }).default
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => sandbox.restore())

  it('builds the Safe chain URL and returns response data', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const get = sandbox.stub().resolves({ data: { count: 0 } })
    const client = loadClient(get)

    const result = await client.get(NETWORK, `/v2/safes/${ADDRESS}/multisig-transactions/`, { executed: false })

    expect(result).to.deep.equal({ count: 0 })
    expect(
      get.calledOnceWith(`${config.SAFE_API.BASE_URI}/eth/api/v2/safes/${ADDRESS}/multisig-transactions/`, {
        params: { executed: false },
      }),
    ).to.equal(true)
  })

  it('reports configuration and unsupported-chain states before HTTP', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('')
    const get = sandbox.stub()
    const client = loadClient(get)

    expect(client.isConfigured()).to.equal(false)
    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected not-configured')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.notConfigured)
      expect((error as SafeReadError).status).to.equal(503)
    }

    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    try {
      client.baseUrl(NetworksEnum.citreaMainnet)
      expect.fail('expected unsupported-chain')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.unsupportedChain)
      expect((error as SafeReadError).status).to.equal(501)
    }

    expect(get.notCalled).to.equal(true)
  })

  it('forwards Retry-After on a rate-limited response', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const get = sandbox.stub().rejects(axiosError(429, { 'retry-after': '17' }))
    const client = loadClient(get)

    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected rate-limited')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.rateLimited)
      expect((error as SafeReadError).status).to.equal(429)
      expect((error as SafeReadError).retryAfter).to.equal(17)
    }
  })

  it('uses a safe default Retry-After when the header is absent', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const get = sandbox.stub().rejects(axiosError(429))
    const client = loadClient(get)

    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected rate-limited')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.rateLimited)
      expect((error as SafeReadError).retryAfter).to.equal(60)
    }
  })

  it('maps upstream statuses and transport failures', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')

    const notFound = loadClient(sandbox.stub().rejects(axiosError(404)))
    try {
      await notFound.get(NETWORK, '/path')
      expect.fail('expected not-found')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.notFound)
      expect((error as SafeReadError).status).to.equal(404)
    }

    sandbox.restore()
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const upstream = loadClient(sandbox.stub().rejects(axiosError(500)))
    try {
      await upstream.get(NETWORK, '/path')
      expect.fail('expected upstream-error')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.upstreamError)
      expect((error as SafeReadError).status).to.equal(502)
    }

    sandbox.restore()
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'warn')
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const unavailable = loadClient(sandbox.stub().rejects(new Error('ECONNRESET')))
    try {
      await unavailable.get(NETWORK, '/path')
      expect.fail('expected connection-error')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.connectionError)
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('maps a non-5xx upstream status to upstream-error without changing its status', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const client = loadClient(sandbox.stub().rejects(axiosError(400)))

    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected upstream-error')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.upstreamError)
      expect((error as SafeReadError).status).to.equal(400)
    }
  })

  it('preserves a SafeReadError raised by the retry layer', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const expected = new SafeReadError(ISafeErrorCode.notFound, 'missing', 404)
    const client = loadClient(sandbox.stub().rejects(expected))

    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected not-found')
    } catch (error) {
      expect(error).to.equal(expected)
    }
  })

  it('maps limiter overflow to a retryable rate-limited response', async () => {
    sandbox.stub(config.SAFE_API, 'API_KEY').value('test-key')
    const get = sandbox.stub()
    const limiter = {
      schedule: () => {
        throw new Bottleneck.BottleneckError()
      },
    }
    const client = loadClient(get, limiter)

    try {
      await client.get(NETWORK, '/path')
      expect.fail('expected rate-limited')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.rateLimited)
      expect((error as SafeReadError).retryAfter).to.equal(10)
    }

    expect(get.notCalled).to.equal(true)
  })
})
