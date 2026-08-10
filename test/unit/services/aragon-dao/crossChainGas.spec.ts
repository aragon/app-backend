import config from '@config'
import { throwExposable } from '@errors'
import logger from '@logger'
import CrossChainGasService from '@modules/crossChainGas/crossChainGasService'
import { CrossChainGasDao } from '@services/aragon-dao/crossChainGas'
import { ErrorKeyEnum, ICrossChainGasStatus, type IQueueCrossChainGasLimit, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const buildParams = (sentAt = Date.now()): IQueueCrossChainGasLimit => ({
  sentAt,
  network: NetworksEnum.baseMainnet,
  controllerAddress: '0x53D16018a33f10D0b067fC70bf8FCF10a5da23Cb',
  destinationChainId: 1,
  actions: [{ to: '0x4200000000000000000000000000000000000006', value: '0', data: '0x095ea7b3' }],
})

// Built per test, never once at module load. `sentAt` is compared against `Date.now()` by the
// consumer, so a value captured when the file loads is already stale by the time the test runs.
let params: IQueueCrossChainGasLimit

describe('Dao: crossChainGas', () => {
  let sandbox: SinonSandbox
  let estimate: sinon.SinonStub
  let loggerWarn: sinon.SinonStub
  let loggerError: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    params = buildParams()
    estimate = sandbox.stub(CrossChainGasService, 'estimateCrossChainGasLimit')

    // Every failure is turned into a reply value, so the log is the only place the real cause is
    // recorded. The tests that hit one check it was written.
    loggerWarn = sandbox.stub(logger, 'warn')
    loggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('passes the queue params through to the estimator in order', async () => {
    estimate.resolves({ status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: 1 })

    const result = await CrossChainGasDao.estimateGasLimit(params)

    expect(result).to.deep.equal({ status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: 1 })
    expect(estimate.firstCall.args).to.deep.equal([
      params.network,
      params.controllerAddress,
      params.destinationChainId,
      params.actions,
      params.sentAt,
    ])
  })

  it('drops a request the API already stopped waiting for', async () => {
    const old = buildParams(Date.now() - config.RABBITMQ.TIMEOUT - 1000)

    const result: any = await CrossChainGasDao.estimateGasLimit(old)

    // No point paying for RPC reads and a simulation nobody is waiting for.
    expect(result.errorKey).to.equal(ErrorKeyEnum.tooBusy)
    expect(estimate.called).to.be.false
    expect(loggerWarn.calledOnceWith('Cross-chain gas: discarded stale queue request' as any)).to.be.true
  })

  it('returns a reverted estimate unchanged - it is a result, not a failure', async () => {
    const reverted = { status: ICrossChainGasStatus.REVERTED, revertReason: 'nope', runAt: 1 }
    estimate.resolves(reverted)

    expect(await CrossChainGasDao.estimateGasLimit(params)).to.deep.equal(reverted)
  })

  describe('failures are returned, never thrown', () => {
    // RabbitMQHelper.process swallows a thrown handler without replying, so the caller would only
    // ever see a timeout. Every failure has to come back as a value.
    it('maps an exposable error to its key and description', async () => {
      estimate.callsFake(() => {
        throwExposable(ErrorKeyEnum.crossChainLaneNotConfigured, 400, 'No lane for this destination')
      })

      const result = await CrossChainGasDao.estimateGasLimit(params)

      expect(result).to.deep.equal({
        error: 'No lane for this destination',
        errorKey: ErrorKeyEnum.crossChainLaneNotConfigured,
      })
    })

    it('preserves the 501 key so the API does not turn it into a 400', async () => {
      estimate.callsFake(() => {
        throwExposable(ErrorKeyEnum.crossChainBridgeUnsupported, 501, 'Not a CCIP adapter')
      })

      const result: any = await CrossChainGasDao.estimateGasLimit(params)

      expect(estimate.calledOnce).to.be.true
      expect(result.errorKey).to.equal(ErrorKeyEnum.crossChainBridgeUnsupported)
      expect(result.error).to.equal('Not a CCIP adapter')
    })

    it('does not let a provider url reach the caller when a node fails', async () => {
      // An ethers transport error carries the provider url, with the api key, in its message. The
      // reply is built from the registry description, never from the error, so it cannot get out.
      estimate.rejects(new Error('server response 403 (requestUrl="https://lb.drpc.org/ogrpc?dkey=SECRET_KEY")'))

      const result: any = await CrossChainGasDao.estimateGasLimit(params)

      expect(JSON.stringify(result)).to.not.contain('SECRET_KEY')
      expect(JSON.stringify(result)).to.not.contain('dkey')
      expect(result.errorKey).to.equal(ErrorKeyEnum.crossChainSimulationFailed)
    })

    it('maps an unexpected error to a simulation failure rather than leaking it', async () => {
      estimate.rejects(new Error('ECONNRESET'))

      const result: any = await CrossChainGasDao.estimateGasLimit(params)

      expect(result.errorKey).to.equal(ErrorKeyEnum.crossChainSimulationFailed)
      expect(result.error).to.not.contain('ECONNRESET')
      // The reply drops the cause, so it has to survive in the log.
      expect(loggerError.calledOnceWith('Cross-chain gas: estimation failed unexpectedly' as any)).to.be.true
      expect(loggerError.firstCall.args[1]).to.include({ error: 'ECONNRESET' })
    })

    it('never throws, whatever the estimator does', async () => {
      estimate.rejects(new Error('boom'))

      await expect(CrossChainGasDao.estimateGasLimit(params)).to.not.be.rejected
    })
  })
})
